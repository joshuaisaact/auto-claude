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

export function decode(mappings: string): SourceMapSegment[][] {
  const lines: SourceMapSegment[][] = [];
  let line: SourceMapSegment[] = [];

  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  let i = 0;
  while (i < mappings.length) {
    const ch = mappings.charAt(i);

    if (ch === ";") {
      lines.push(line);
      line = [];
      generatedColumn = 0;
      i++;
    } else if (ch === ",") {
      i++;
    } else {
      // Decode a segment (1, 4, or 5 VLQ values)
      const segStart = i;

      let value: number;

      // 1. Generated column
      [value, i] = decodeVLQ(mappings, i);
      generatedColumn += value;

      if (i >= mappings.length || mappings.charAt(i) === "," || mappings.charAt(i) === ";") {
        // 1-value segment (generated column only) — rare but valid
        line.push([generatedColumn] as unknown as SourceMapSegment);
        continue;
      }

      // 2. Source index
      [value, i] = decodeVLQ(mappings, i);
      sourceIndex += value;

      // 3. Original line
      [value, i] = decodeVLQ(mappings, i);
      originalLine += value;

      // 4. Original column
      [value, i] = decodeVLQ(mappings, i);
      originalColumn += value;

      if (i >= mappings.length || mappings.charAt(i) === "," || mappings.charAt(i) === ";") {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        continue;
      }

      // 5. Name index
      [value, i] = decodeVLQ(mappings, i);
      nameIndex += value;
      line.push([generatedColumn, sourceIndex, originalLine, originalColumn, nameIndex]);
    }
  }

  lines.push(line);
  return lines;
}

function decodeVLQ(str: string, offset: number): [number, number] {
  let result = 0;
  let shift = 0;

  while (true) {
    const digit = B64_DECODE[str.charCodeAt(offset++)];
    if (digit === 255) throw new Error(`Invalid base64 char: ${str[offset - 1]}`);

    result |= (digit & 0x1f) << shift;
    shift += 5;

    if ((digit & 0x20) === 0) break;
  }

  // Bit 0 is the sign
  if (result & 1) {
    return [-(result >> 1), offset];
  }
  return [result >> 1, offset];
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
