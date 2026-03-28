// Source map VLQ codec — naive but correct implementation.
// This is the file the autoresearch agent edits.

export type SourceMapSegment =
  | [number, number, number, number]
  | [number, number, number, number, number];

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Lookup table: charCode -> base64 digit (0-63), 255 for invalid
const B64_DECODE = new Uint8Array(128);
B64_DECODE.fill(255);
for (let i = 0; i < 64; i++) {
  B64_DECODE[B64_CHARS.charCodeAt(i)] = i;
}

// Module-level state for decodeVLQ to avoid tuple allocation
let vlqValue = 0;
let vlqPos = 0;

const SEMICOLON = 59; // ';'.charCodeAt(0)
const COMMA = 44;     // ','.charCodeAt(0)

export function decode(mappings: string): SourceMapSegment[][] {
  const lines: SourceMapSegment[][] = [];
  let line: SourceMapSegment[] = [];

  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  const len = mappings.length;
  let i = 0;
  while (i < len) {
    const cc = mappings.charCodeAt(i);

    if (cc === SEMICOLON) {
      lines.push(line);
      line = [];
      generatedColumn = 0;
      i++;
    } else if (cc === COMMA) {
      i++;
    } else {
      // Decode a segment (1, 4, or 5 VLQ values)

      // 1. Generated column
      decodeVLQ(mappings, i);
      generatedColumn += vlqValue;
      i = vlqPos;

      if (i >= len) {
        line.push([generatedColumn] as unknown as SourceMapSegment);
        continue;
      }
      const cc1 = mappings.charCodeAt(i);
      if (cc1 === COMMA || cc1 === SEMICOLON) {
        line.push([generatedColumn] as unknown as SourceMapSegment);
        continue;
      }

      // 2. Source index
      decodeVLQ(mappings, i);
      sourceIndex += vlqValue;
      i = vlqPos;

      // 3. Original line
      decodeVLQ(mappings, i);
      originalLine += vlqValue;
      i = vlqPos;

      // 4. Original column
      decodeVLQ(mappings, i);
      originalColumn += vlqValue;
      i = vlqPos;

      if (i >= len) {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        continue;
      }
      const cc4 = mappings.charCodeAt(i);
      if (cc4 === COMMA || cc4 === SEMICOLON) {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        continue;
      }

      // 5. Name index
      decodeVLQ(mappings, i);
      nameIndex += vlqValue;
      i = vlqPos;
      line.push([generatedColumn, sourceIndex, originalLine, originalColumn, nameIndex]);
    }
  }

  lines.push(line);
  return lines;
}

function decodeVLQ(str: string, offset: number): void {
  let result = 0;
  let shift = 0;

  while (true) {
    const digit = B64_DECODE[str.charCodeAt(offset++)];
    if (digit === 255) throw new Error(`Invalid base64 char: ${str[offset - 1]}`);

    result |= (digit & 0x1f) << shift;
    shift += 5;

    if ((digit & 0x20) === 0) break;
  }

  vlqPos = offset;
  vlqValue = result & 1 ? -(result >> 1) : result >> 1;
}

// Pre-compute VLQ strings for values -255..255 using a flat array
const VLQ_CACHE_OFFSET = 255;
const VLQ_CACHE: string[] = new Array(511);
for (let v = -255; v <= 255; v++) {
  let vlq = v < 0 ? ((-v) << 1) | 1 : v << 1;
  let s = "";
  do {
    let d = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) d |= 0x20;
    s += B64_CHARS[d];
  } while (vlq > 0);
  VLQ_CACHE[v + VLQ_CACHE_OFFSET] = s;
}

export function encode(decoded: SourceMapSegment[][]): string {
  let result = "";

  let prevGeneratedColumn = 0;
  let prevSourceIndex = 0;
  let prevOriginalLine = 0;
  let prevOriginalColumn = 0;
  let prevNameIndex = 0;

  for (let i = 0; i < decoded.length; i++) {
    if (i > 0) result += ";";

    const line = decoded[i];
    prevGeneratedColumn = 0;

    for (let j = 0; j < line.length; j++) {
      if (j > 0) result += ",";

      const segment = line[j];

      result += encodeVLQ(segment[0] - prevGeneratedColumn);
      prevGeneratedColumn = segment[0];

      if (segment.length >= 4) {
        result += encodeVLQ(segment[1] - prevSourceIndex);
        prevSourceIndex = segment[1];

        result += encodeVLQ(segment[2] - prevOriginalLine);
        prevOriginalLine = segment[2];

        result += encodeVLQ(segment[3] - prevOriginalColumn);
        prevOriginalColumn = segment[3];

        if (segment.length === 5) {
          result += encodeVLQ(segment[4] - prevNameIndex);
          prevNameIndex = segment[4];
        }
      }
    }
  }

  return result;
}

function encodeVLQ(value: number): string {
  if (value >= -255 && value <= 255) return VLQ_CACHE[value + VLQ_CACHE_OFFSET];

  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let result = "";

  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20;
    result += B64_CHARS[digit];
  } while (vlq > 0);

  return result;
}
