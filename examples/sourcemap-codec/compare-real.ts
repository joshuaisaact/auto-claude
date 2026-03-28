// Benchmark against real source maps from actual projects.

import { readFileSync } from "fs";
import { encode, decode } from "./src/codec.ts";
import { encode as jEncode, decode as jDecode } from "@jridgewell/sourcemap-codec";

const maps = [
  // Libraries from CDN
  { name: "moment", path: "/tmp/moment.map" },
  { name: "rxjs", path: "/tmp/rxjs.map" },
  { name: "chart.js", path: "/tmp/chartjs.map" },
  { name: "pdf-lib", path: "/tmp/pdflib.map" },
  // Real Next.js / Turbopack build output
  { name: "babel-parser", path: "/home/josh/Coding/portfolio-astro/node_modules/.pnpm/@babel+parser@7.28.5/node_modules/@babel/parser/lib/index.js.map" },
  { name: "next app ssr", path: "/home/josh/Coding/granola-takehome/.next/server/chunks/ssr/[root-of-the-server]__10..me1._.js.map" },
  { name: "next mega bundle", path: "/home/josh/Coding/granola-takehome/.next/server/chunks/node_modules_0e1bcy.._.js.map" },
];

const ITERATIONS = 30;

function bench(mappings: string, decodeFn: (s: string) => unknown, encodeFn: (d: unknown) => unknown) {
  const decoded = decodeFn(mappings);
  for (let i = 0; i < 3; i++) { decodeFn(mappings); encodeFn(decoded); }

  const dt: number[] = [];
  for (let r = 0; r < 5; r++) {
    const s = performance.now();
    for (let i = 0; i < ITERATIONS; i++) decodeFn(mappings);
    dt.push(performance.now() - s);
  }
  dt.sort((a, b) => a - b);

  const et: number[] = [];
  for (let r = 0; r < 5; r++) {
    const s = performance.now();
    for (let i = 0; i < ITERATIONS; i++) encodeFn(decoded);
    et.push(performance.now() - s);
  }
  et.sort((a, b) => a - b);

  return { decode: dt[2], encode: et[2] };
}

for (const m of maps) {
  let raw: { mappings: string };
  try {
    raw = JSON.parse(readFileSync(m.path, "utf8"));
  } catch {
    console.log(`=== ${m.name} — skipped (parse error) ===\n`);
    continue;
  }
  const mappings = raw.mappings;

  console.log(`=== ${m.name} (${(mappings.length / 1000).toFixed(0)}K chars) ===`);

  const ours = bench(mappings, decode, encode);
  const theirs = bench(mappings, jDecode, jEncode);

  const dPct = (((theirs.decode - ours.decode) / theirs.decode) * 100).toFixed(0);
  const ePct = (((theirs.encode - ours.encode) / theirs.encode) * 100).toFixed(0);
  const tOurs = ours.decode + ours.encode;
  const tTheirs = theirs.decode + theirs.encode;
  const tPct = (((tTheirs - tOurs) / tTheirs) * 100).toFixed(0);

  console.log(`  ${"ours".padEnd(16)} decode ${ours.decode.toFixed(1).padStart(8)}ms  encode ${ours.encode.toFixed(1).padStart(8)}ms  total ${tOurs.toFixed(1).padStart(8)}ms`);
  console.log(`  ${"@jridgewell".padEnd(16)} decode ${theirs.decode.toFixed(1).padStart(8)}ms  encode ${theirs.encode.toFixed(1).padStart(8)}ms  total ${tTheirs.toFixed(1).padStart(8)}ms`);
  console.log(`  ${"delta".padEnd(16)}        ${(dPct + "%").padStart(8)}          ${(ePct + "%").padStart(8)}        ${(tPct + "%").padStart(8)}   faster`);
  console.log("");
}
