// Source map corpus: real production maps + small synthetic for edge cases.
// FROZEN — do not modify during autoresearch.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { SourceMapSegment } from "./src/codec.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Reference decoder for building corpus (not the one under test)
function refDecode(mappings: string): SourceMapSegment[][] {
  const lines: SourceMapSegment[][] = [];
  let line: SourceMapSegment[] = [];

  let gc = 0, si = 0, ol = 0, oc = 0, ni = 0;
  let i = 0;

  while (i < mappings.length) {
    const ch = mappings.charCodeAt(i);
    if (ch === 59) { // ;
      lines.push(line); line = []; gc = 0; i++;
    } else if (ch === 44) { // ,
      i++;
    } else {
      const seg: number[] = [];
      while (i < mappings.length) {
        let result = 0, shift = 0, digit: number;
        do {
          digit = B64.indexOf(mappings[i++]);
          result |= (digit & 0x1f) << shift;
          shift += 5;
        } while (digit & 0x20);
        seg.push(result & 1 ? -(result >> 1) : result >> 1);
        if (i >= mappings.length) break;
        const next = mappings.charCodeAt(i);
        if (next === 44 || next === 59) break;
      }
      if (seg.length >= 1) seg[0] = gc = gc + seg[0];
      if (seg.length >= 2) seg[1] = si = si + seg[1];
      if (seg.length >= 3) seg[2] = ol = ol + seg[2];
      if (seg.length >= 4) seg[3] = oc = oc + seg[3];
      if (seg.length >= 5) seg[4] = ni = ni + seg[4];
      line.push(seg as SourceMapSegment);
    }
  }
  lines.push(line);
  return lines;
}

// Mulberry32 PRNG
function prng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    const t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    const u = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((u ^ (u >>> 14)) >>> 0) / 4294967296;
  };
}

function encodeVLQRef(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let result = "";
  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20;
    result += B64[digit];
  } while (vlq > 0);
  return result;
}

function generateSmall(rng: () => number): { encoded: string; decoded: SourceMapSegment[][] } {
  const decoded: SourceMapSegment[][] = [];
  let encoded = "";
  let prevGenCol = 0, prevSrcIdx = 0, prevOrigLine = 0, prevOrigCol = 0;

  for (let i = 0; i < 20; i++) {
    if (i > 0) encoded += ";";
    const line: SourceMapSegment[] = [];
    prevGenCol = 0;
    const numSegs = 3 + ((rng() * 5) | 0);
    let genCol = 0;
    for (let j = 0; j < numSegs; j++) {
      if (j > 0) encoded += ",";
      genCol += 1 + ((rng() * 20) | 0);
      const srcIdx = 0;
      const origLine = i;
      const origCol = (rng() * 80) | 0;
      encoded += encodeVLQRef(genCol - prevGenCol);
      encoded += encodeVLQRef(srcIdx - prevSrcIdx);
      encoded += encodeVLQRef(origLine - prevOrigLine);
      encoded += encodeVLQRef(origCol - prevOrigCol);
      prevGenCol = genCol; prevSrcIdx = srcIdx; prevOrigLine = origLine; prevOrigCol = origCol;
      line.push([genCol, srcIdx, origLine, origCol]);
    }
    decoded.push(line);
  }
  return { encoded, decoded };
}

function loadFixture(name: string): { encoded: string; decoded: SourceMapSegment[][] } {
  const encoded = readFileSync(join(__dirname, "fixtures", name + ".mappings"), "utf8");
  const decoded = refDecode(encoded);
  return { encoded, decoded };
}

export interface TestCase {
  name: string;
  encoded: string;
  decoded: SourceMapSegment[][];
}

export function generateCorpus(): TestCase[] {
  const rng = prng(42);
  const small = generateSmall(rng);

  return [
    { name: "small-synthetic", ...small },
    { name: "chart.js (310K)", ...loadFixture("chartjs") },
    { name: "next-ssr (697K)", ...loadFixture("next-ssr") },
    { name: "next-mega (946K)", ...loadFixture("next-mega") },
  ];
}
