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
  let result: number;
  let shift: number;
  let digit: number;

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
      // Inline VLQ decode #1: Generated column (with single-char fast path)
      digit = B64_DECODE[mappings.charCodeAt(i++)];
      if (digit < 32) {
        generatedColumn += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[mappings.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        generatedColumn += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      if (i >= len) {
        line.push([generatedColumn] as unknown as SourceMapSegment);
        continue;
      }
      const cc1 = mappings.charCodeAt(i);
      if (cc1 === COMMA || cc1 === SEMICOLON) {
        line.push([generatedColumn] as unknown as SourceMapSegment);
        continue;
      }

      // Inline VLQ decode #2: Source index
      digit = B64_DECODE[mappings.charCodeAt(i++)];
      if (digit < 32) {
        sourceIndex += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[mappings.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        sourceIndex += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      // Inline VLQ decode #3: Original line
      digit = B64_DECODE[mappings.charCodeAt(i++)];
      if (digit < 32) {
        originalLine += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[mappings.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        originalLine += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      // Inline VLQ decode #4: Original column
      digit = B64_DECODE[mappings.charCodeAt(i++)];
      if (digit < 32) {
        originalColumn += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[mappings.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        originalColumn += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      if (i >= len) {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        continue;
      }
      const cc4 = mappings.charCodeAt(i);
      if (cc4 === COMMA || cc4 === SEMICOLON) {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        continue;
      }

      // Inline VLQ decode #5: Name index
      digit = B64_DECODE[mappings.charCodeAt(i++)];
      if (digit < 32) {
        nameIndex += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[mappings.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        nameIndex += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      line.push([generatedColumn, sourceIndex, originalLine, originalColumn, nameIndex]);
    }
  }

  lines.push(line);
  return lines;
}

// Pre-compute VLQ strings for values -1023..1023 using a flat array
const VLQ_CACHE_OFFSET = 1023;
const VLQ_CACHE: string[] = new Array(2047);
// Also a comma-prefixed cache for segments that aren't first in line
const VLQ_COMMA_CACHE: string[] = new Array(2047);
for (let v = -1023; v <= 1023; v++) {
  let vlq = v < 0 ? ((-v) << 1) | 1 : v << 1;
  let s = "";
  do {
    let d = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) d |= 0x20;
    s += B64_CHARS[d];
  } while (vlq > 0);
  VLQ_CACHE[v + VLQ_CACHE_OFFSET] = s;
  VLQ_COMMA_CACHE[v + VLQ_CACHE_OFFSET] = "," + s;
}

// Encode lookup table: digit (0-63) -> single-char string
const B64_CHAR_TABLE: string[] = new Array(64);
for (let i = 0; i < 64; i++) B64_CHAR_TABLE[i] = B64_CHARS[i];

export function encode(decoded: SourceMapSegment[][]): string {
  let result = "";

  let prevGeneratedColumn = 0;
  let prevSourceIndex = 0;
  let prevOriginalLine = 0;
  let prevOriginalColumn = 0;
  let prevNameIndex = 0;

  let value: number;
  let vlq: number;
  let d: number;

  for (let i = 0; i < decoded.length; i++) {
    if (i > 0) result += ";";

    const line = decoded[i];
    prevGeneratedColumn = 0;

    for (let j = 0; j < line.length; j++) {
      const segment = line[j];

      // Inline VLQ encode #1: generated column (with comma prefix for j > 0)
      value = segment[0] - prevGeneratedColumn;
      prevGeneratedColumn = segment[0];
      if (value >= -1023 && value <= 1023) {
        result += j > 0 ? VLQ_COMMA_CACHE[value + VLQ_CACHE_OFFSET] : VLQ_CACHE[value + VLQ_CACHE_OFFSET];
      } else {
        if (j > 0) result += ",";
        vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
        do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
      }

      if (segment.length >= 4) {
        // Inline VLQ encode #2: source index
        value = segment[1] - prevSourceIndex;
        prevSourceIndex = segment[1];
        if (value >= -1023 && value <= 1023) {
          result += VLQ_CACHE[value + VLQ_CACHE_OFFSET];
        } else {
          vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
          do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
        }

        // Inline VLQ encode #3: original line
        value = segment[2] - prevOriginalLine;
        prevOriginalLine = segment[2];
        if (value >= -1023 && value <= 1023) {
          result += VLQ_CACHE[value + VLQ_CACHE_OFFSET];
        } else {
          vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
          do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
        }

        // Inline VLQ encode #4: original column
        value = segment[3] - prevOriginalColumn;
        prevOriginalColumn = segment[3];
        if (value >= -1023 && value <= 1023) {
          result += VLQ_CACHE[value + VLQ_CACHE_OFFSET];
        } else {
          vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
          do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
        }

        if (segment.length === 5) {
          // Inline VLQ encode #5: name index
          value = segment[4] - prevNameIndex;
          prevNameIndex = segment[4];
          if (value >= -1023 && value <= 1023) {
            result += VLQ_CACHE[value + VLQ_CACHE_OFFSET];
          } else {
            vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
            do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
          }
        }
      }
    }
  }

  return result;
}
