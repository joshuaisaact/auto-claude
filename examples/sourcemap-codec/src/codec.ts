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
  const decoded: SourceMapSegment[][] = [];
  const len = mappings.length;

  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  let i = 0;
  let result: number;
  let shift: number;
  let digit: number;

  do {
    // Find end of current line using native indexOf (C++ fast path)
    const semi = mappings.indexOf(";", i);
    const lineEnd = semi === -1 ? len : semi;
    const line: SourceMapSegment[] = [];
    generatedColumn = 0;

    while (i < lineEnd) {
      // Inline VLQ decode: generated column (single-char fast path)
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

      // Peek: is there more in this segment, or is it a 1-field segment?
      if (i >= lineEnd || mappings.charCodeAt(i) === COMMA) {
        line.push([generatedColumn] as unknown as SourceMapSegment);
        i++; // skip comma (or harmlessly go past lineEnd)
        continue;
      }

      // Inline VLQ decode: source index
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

      // Inline VLQ decode: original line
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

      // Inline VLQ decode: original column
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

      // Peek: 4-field or 5-field?
      if (i >= lineEnd || mappings.charCodeAt(i) === COMMA) {
        line.push([generatedColumn, sourceIndex, originalLine, originalColumn]);
        i++; // skip comma
        continue;
      }

      // Inline VLQ decode: name index
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
      i++; // skip comma (or harmlessly go past lineEnd)
    }

    decoded.push(line);
    i = lineEnd + 1; // skip past the semicolon
  } while (i <= len);

  return decoded;
}

// Encode: chunked byte buffer flushed via TextDecoder every 16KB.
// Writing one byte at a time into a fixed buffer is cheaper than string concat
// for large outputs, because the += only happens at chunk boundaries.

const B64_ENCODE = new Uint8Array(64);
for (let i = 0; i < 64; i++) B64_ENCODE[i] = B64_CHARS.charCodeAt(i);

const BUF_LENGTH = 1024 * 16;
const td = new TextDecoder();

export function encode(decoded: SourceMapSegment[][]): string {
  const buf = new Uint8Array(BUF_LENGTH);
  let pos = 0;
  let out = "";

  let prevSourceIndex = 0;
  let prevOriginalLine = 0;
  let prevOriginalColumn = 0;
  let prevNameIndex = 0;

  for (let i = 0; i < decoded.length; i++) {
    if (i > 0) {
      buf[pos++] = 59; // ;
      if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
    }

    const line = decoded[i];
    let prevGeneratedColumn = 0;

    for (let j = 0; j < line.length; j++) {
      const segment = line[j];

      if (j > 0) {
        buf[pos++] = 44; // ,
        if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
      }

      // VLQ encode #1: generated column
      let delta = segment[0] - prevGeneratedColumn;
      prevGeneratedColumn = segment[0];
      let vlq = delta < 0 ? (-delta << 1) | 1 : delta << 1;
      do {
        let clamped = vlq & 31;
        vlq >>>= 5;
        if (vlq > 0) clamped |= 32;
        buf[pos++] = B64_ENCODE[clamped];
        if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
      } while (vlq > 0);

      if (segment.length === 1) continue;

      // VLQ encode #2: source index
      delta = segment[1] - prevSourceIndex;
      prevSourceIndex = segment[1];
      vlq = delta < 0 ? (-delta << 1) | 1 : delta << 1;
      do {
        let clamped = vlq & 31;
        vlq >>>= 5;
        if (vlq > 0) clamped |= 32;
        buf[pos++] = B64_ENCODE[clamped];
        if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
      } while (vlq > 0);

      // VLQ encode #3: original line
      delta = segment[2] - prevOriginalLine;
      prevOriginalLine = segment[2];
      vlq = delta < 0 ? (-delta << 1) | 1 : delta << 1;
      do {
        let clamped = vlq & 31;
        vlq >>>= 5;
        if (vlq > 0) clamped |= 32;
        buf[pos++] = B64_ENCODE[clamped];
        if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
      } while (vlq > 0);

      // VLQ encode #4: original column
      delta = segment[3] - prevOriginalColumn;
      prevOriginalColumn = segment[3];
      vlq = delta < 0 ? (-delta << 1) | 1 : delta << 1;
      do {
        let clamped = vlq & 31;
        vlq >>>= 5;
        if (vlq > 0) clamped |= 32;
        buf[pos++] = B64_ENCODE[clamped];
        if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
      } while (vlq > 0);

      if (segment.length === 4) continue;

      // VLQ encode #5: name index
      delta = segment[4] - prevNameIndex;
      prevNameIndex = segment[4];
      vlq = delta < 0 ? (-delta << 1) | 1 : delta << 1;
      do {
        let clamped = vlq & 31;
        vlq >>>= 5;
        if (vlq > 0) clamped |= 32;
        buf[pos++] = B64_ENCODE[clamped];
        if (pos === BUF_LENGTH) { out += td.decode(buf); pos = 0; }
      } while (vlq > 0);
    }
  }

  return pos > 0 ? out + td.decode(buf.subarray(0, pos)) : out;
}
