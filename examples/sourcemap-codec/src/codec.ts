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

  // Append a sentinel so we never need to check i >= len in the hot path
  const input = mappings + ";";
  const len = mappings.length;
  let i = 0;
  let result: number;
  let shift: number;
  let digit: number;
  let cc: number;

  while (i < len) {
    cc = input.charCodeAt(i);

    if (cc === SEMICOLON) {
      lines.push(line);
      line = [];
      generatedColumn = 0;
      i++;
    } else if (cc === COMMA) {
      i++;
    } else {
      // Inline VLQ decode #1: Generated column
      digit = B64_DECODE[input.charCodeAt(i++)];
      if (digit < 32) {
        generatedColumn += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[input.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        generatedColumn += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      // Check next char — sentinel guarantees no bounds check needed
      cc = input.charCodeAt(i);
      if (cc === COMMA || cc === SEMICOLON) {
        line.push([generatedColumn] as unknown as SourceMapSegment);
        continue;
      }

      // Inline VLQ decode #2: Source index
      digit = B64_DECODE[input.charCodeAt(i++)];
      if (digit < 32) {
        sourceIndex += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[input.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        sourceIndex += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      // Inline VLQ decode #3: Original line
      digit = B64_DECODE[input.charCodeAt(i++)];
      if (digit < 32) {
        originalLine += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[input.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        originalLine += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      // Inline VLQ decode #4: Original column
      digit = B64_DECODE[input.charCodeAt(i++)];
      if (digit < 32) {
        originalColumn += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[input.charCodeAt(i++)];
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        originalColumn += ((result >> 1) ^ -(result & 1)) + (result & 1);
      }

      // Check next char
      cc = input.charCodeAt(i);
      if (cc === COMMA || cc === SEMICOLON) {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        continue;
      }

      // Inline VLQ decode #5: Name index
      digit = B64_DECODE[input.charCodeAt(i++)];
      if (digit < 32) {
        nameIndex += ((digit >> 1) ^ -(digit & 1)) + (digit & 1);
      } else {
        result = digit & 0x1f; shift = 5;
        do {
          digit = B64_DECODE[input.charCodeAt(i++)];
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

  let v1: number;
  let v2: number;
  let v3: number;
  let v4: number;
  let v5: number;
  let vlq: number;
  let d: number;
  let seg: SourceMapSegment;

  for (let i = 0; i < decoded.length; i++) {
    if (i > 0) result += ";";

    const line = decoded[i];
    const lineLen = line.length;
    if (lineLen === 0) continue;
    prevGeneratedColumn = 0;

    // Handle first segment (j=0) without comma prefix
    seg = line[0];
    if (seg.length >= 4) {
      v1 = seg[0] - prevGeneratedColumn;
      prevGeneratedColumn = seg[0];
      v2 = seg[1] - prevSourceIndex;
      prevSourceIndex = seg[1];
      v3 = seg[2] - prevOriginalLine;
      prevOriginalLine = seg[2];
      v4 = seg[3] - prevOriginalColumn;
      prevOriginalColumn = seg[3];

      if (v1 >= -1023 && v1 <= 1023 &&
          v2 >= -1023 && v2 <= 1023 &&
          v3 >= -1023 && v3 <= 1023 &&
          v4 >= -1023 && v4 <= 1023) {
        if (seg.length === 5) {
          v5 = seg[4] - prevNameIndex;
          prevNameIndex = seg[4];
          if (v5 >= -1023 && v5 <= 1023) {
            result += VLQ_CACHE[v1 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v4 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v5 + VLQ_CACHE_OFFSET];
          } else {
            result += VLQ_CACHE[v1 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v4 + VLQ_CACHE_OFFSET];
            vlq = v5 < 0 ? ((-v5) << 1) | 1 : v5 << 1;
            do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
          }
        } else {
          result += VLQ_CACHE[v1 + VLQ_CACHE_OFFSET]
            + VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]
            + VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]
            + VLQ_CACHE[v4 + VLQ_CACHE_OFFSET];
        }
      } else {
        // Slow path for j=0
        if (v1 >= -1023 && v1 <= 1023) { result += VLQ_CACHE[v1 + VLQ_CACHE_OFFSET]; }
        else { vlq = v1 < 0 ? ((-v1) << 1) | 1 : v1 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (v2 >= -1023 && v2 <= 1023) { result += VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]; }
        else { vlq = v2 < 0 ? ((-v2) << 1) | 1 : v2 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (v3 >= -1023 && v3 <= 1023) { result += VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]; }
        else { vlq = v3 < 0 ? ((-v3) << 1) | 1 : v3 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (v4 >= -1023 && v4 <= 1023) { result += VLQ_CACHE[v4 + VLQ_CACHE_OFFSET]; }
        else { vlq = v4 < 0 ? ((-v4) << 1) | 1 : v4 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (seg.length === 5) {
          v5 = seg[4] - prevNameIndex; prevNameIndex = seg[4];
          if (v5 >= -1023 && v5 <= 1023) { result += VLQ_CACHE[v5 + VLQ_CACHE_OFFSET]; }
          else { vlq = v5 < 0 ? ((-v5) << 1) | 1 : v5 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        }
      }
    } else {
      v1 = seg[0] - prevGeneratedColumn;
      prevGeneratedColumn = seg[0];
      if (v1 >= -1023 && v1 <= 1023) { result += VLQ_CACHE[v1 + VLQ_CACHE_OFFSET]; }
      else { vlq = v1 < 0 ? ((-v1) << 1) | 1 : v1 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
    }

    // Remaining segments (j > 0) always use comma-prefixed cache
    for (let j = 1; j < lineLen; j++) {
      seg = line[j];

      if (seg.length >= 4) {
        v1 = seg[0] - prevGeneratedColumn;
        prevGeneratedColumn = seg[0];
        v2 = seg[1] - prevSourceIndex;
        prevSourceIndex = seg[1];
        v3 = seg[2] - prevOriginalLine;
        prevOriginalLine = seg[2];
        v4 = seg[3] - prevOriginalColumn;
        prevOriginalColumn = seg[3];

        if (v1 >= -1023 && v1 <= 1023 &&
            v2 >= -1023 && v2 <= 1023 &&
            v3 >= -1023 && v3 <= 1023 &&
            v4 >= -1023 && v4 <= 1023) {
          if (seg.length === 5) {
            v5 = seg[4] - prevNameIndex;
            prevNameIndex = seg[4];
            if (v5 >= -1023 && v5 <= 1023) {
              result += VLQ_COMMA_CACHE[v1 + VLQ_CACHE_OFFSET]
                + VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]
                + VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]
                + VLQ_CACHE[v4 + VLQ_CACHE_OFFSET]
                + VLQ_CACHE[v5 + VLQ_CACHE_OFFSET];
              continue;
            }
            result += VLQ_COMMA_CACHE[v1 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]
              + VLQ_CACHE[v4 + VLQ_CACHE_OFFSET];
            vlq = v5 < 0 ? ((-v5) << 1) | 1 : v5 << 1;
            do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0);
            continue;
          }
          result += VLQ_COMMA_CACHE[v1 + VLQ_CACHE_OFFSET]
            + VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]
            + VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]
            + VLQ_CACHE[v4 + VLQ_CACHE_OFFSET];
          continue;
        }

        // Slow path
        if (v1 >= -1023 && v1 <= 1023) { result += VLQ_COMMA_CACHE[v1 + VLQ_CACHE_OFFSET]; }
        else { result += ","; vlq = v1 < 0 ? ((-v1) << 1) | 1 : v1 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (v2 >= -1023 && v2 <= 1023) { result += VLQ_CACHE[v2 + VLQ_CACHE_OFFSET]; }
        else { vlq = v2 < 0 ? ((-v2) << 1) | 1 : v2 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (v3 >= -1023 && v3 <= 1023) { result += VLQ_CACHE[v3 + VLQ_CACHE_OFFSET]; }
        else { vlq = v3 < 0 ? ((-v3) << 1) | 1 : v3 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (v4 >= -1023 && v4 <= 1023) { result += VLQ_CACHE[v4 + VLQ_CACHE_OFFSET]; }
        else { vlq = v4 < 0 ? ((-v4) << 1) | 1 : v4 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        if (seg.length === 5) {
          v5 = seg[4] - prevNameIndex; prevNameIndex = seg[4];
          if (v5 >= -1023 && v5 <= 1023) { result += VLQ_CACHE[v5 + VLQ_CACHE_OFFSET]; }
          else { vlq = v5 < 0 ? ((-v5) << 1) | 1 : v5 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
        }
      } else {
        v1 = seg[0] - prevGeneratedColumn;
        prevGeneratedColumn = seg[0];
        if (v1 >= -1023 && v1 <= 1023) { result += VLQ_COMMA_CACHE[v1 + VLQ_CACHE_OFFSET]; }
        else { result += ","; vlq = v1 < 0 ? ((-v1) << 1) | 1 : v1 << 1; do { d = vlq & 0x1f; vlq >>>= 5; if (vlq > 0) d |= 0x20; result += B64_CHAR_TABLE[d]; } while (vlq > 0); }
      }
    }
  }

  return result;
}
