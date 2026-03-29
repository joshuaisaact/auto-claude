// Benchmark on diverse real API datasets we haven't optimized against.

import { compile, type Schema } from "./src/serialize.ts";
import fastJsonStringify from "fast-json-stringify";
import { readFileSync } from "fs";

const ITERATIONS = 200;

interface TestCase {
  name: string;
  schema: Schema;
  data: unknown[];
}

function load(path: string, extract?: string): unknown[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (extract) return raw[extract];
  return Array.isArray(raw) ? raw : [raw];
}

const cases: TestCase[] = [
  // --- Already in our training corpus ---
  {
    name: "jsonplaceholder/posts",
    schema: { type: "object", properties: { userId: { type: "integer" }, id: { type: "integer" }, title: { type: "string" }, body: { type: "string" } } },
    data: load("/tmp/jsonplaceholder-posts.json"),
  },
  {
    name: "jsonplaceholder/comments",
    schema: { type: "object", properties: { postId: { type: "integer" }, id: { type: "integer" }, name: { type: "string" }, email: { type: "string" }, body: { type: "string" } } },
    data: load("/tmp/jsonplaceholder-comments.json"),
  },
  {
    name: "github/issues",
    schema: { type: "object", properties: { url: { type: "string" }, html_url: { type: "string" }, id: { type: "integer" }, node_id: { type: "string" }, number: { type: "integer" }, title: { type: "string" }, state: { type: "string" }, locked: { type: "boolean" }, comments: { type: "integer" }, created_at: { type: "string" }, updated_at: { type: "string" }, author_association: { type: "string" }, body: { type: "string" } } },
    data: load("/tmp/github-issues.json"),
  },

  // --- NEW: unseen datasets ---
  {
    name: "github/repos (search)",
    schema: { type: "object", properties: { id: { type: "integer" }, node_id: { type: "string" }, name: { type: "string" }, full_name: { type: "string" }, html_url: { type: "string" }, description: { type: "string" }, fork: { type: "boolean" }, url: { type: "string" }, created_at: { type: "string" }, updated_at: { type: "string" }, pushed_at: { type: "string" }, homepage: { type: "string" }, stargazers_count: { type: "integer" }, watchers_count: { type: "integer" }, language: { type: "string" }, forks_count: { type: "integer" }, open_issues_count: { type: "integer" } } },
    data: load("/tmp/gh-repos.json", "items"),
  },
  {
    name: "github/commits",
    schema: { type: "object", properties: { sha: { type: "string" }, node_id: { type: "string" }, url: { type: "string" }, html_url: { type: "string" }, comments_url: { type: "string" } } },
    data: load("/tmp/gh-commits.json"),
  },
  {
    name: "dummyjson/products",
    schema: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, price: { type: "number" }, discountPercentage: { type: "number" }, rating: { type: "number" }, stock: { type: "integer" }, tags: { type: "array", items: { type: "string" } }, brand: { type: "string" }, sku: { type: "string" } } },
    data: load("/tmp/dummyjson-products.json", "products"),
  },
  {
    name: "dummyjson/quotes",
    schema: { type: "object", properties: { id: { type: "integer" }, quote: { type: "string" }, author: { type: "string" } } },
    data: load("/tmp/dummyjson-quotes.json", "quotes"),
  },
];

// Verify correctness
for (const tc of cases) {
  const s = compile(tc.schema);
  const schemaKeys = Object.keys(tc.schema.properties ?? {});
  for (let i = 0; i < tc.data.length; i++) {
    const obj = tc.data[i] as Record<string, unknown>;
    const projected: Record<string, unknown> = {};
    for (const k of schemaKeys) {
      if (obj[k] !== undefined && obj[k] !== null) projected[k] = obj[k];
    }
    const ours = s(tc.data[i]);
    const expected = JSON.stringify(projected);
    if (ours !== expected) {
      console.error(`MISMATCH ${tc.name} item ${i}:`);
      console.error(`  ours:     ${ours.slice(0, 120)}...`);
      console.error(`  expected: ${expected.slice(0, 120)}...`);
      process.exit(1);
    }
  }
}
console.log("correctness: OK\n");

// Per-dataset benchmark
console.log("=== per-dataset ===\n");

let oursAgg = 0, nativeAgg = 0, fjsAgg = 0;

for (const tc of cases) {
  const ourSerializer = compile(tc.schema);
  const fjsSerializer = fastJsonStringify(tc.schema as unknown as Parameters<typeof fastJsonStringify>[0]);

  function bench(fn: () => void): number {
    for (let i = 0; i < 3; i++) fn();
    const times: number[] = [];
    for (let r = 0; r < 5; r++) {
      const start = performance.now();
      fn();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return times[2];
  }

  const ot = bench(() => { for (let i = 0; i < ITERATIONS; i++) for (const obj of tc.data) ourSerializer(obj); });
  const nt = bench(() => { for (let i = 0; i < ITERATIONS; i++) for (const obj of tc.data) JSON.stringify(obj); });
  const ft = bench(() => { for (let i = 0; i < ITERATIONS; i++) for (const obj of tc.data) fjsSerializer(obj); });

  oursAgg += ot; nativeAgg += nt; fjsAgg += ft;

  const vsN = (((nt - ot) / nt) * 100).toFixed(0);
  const vsF = (((ft - ot) / ft) * 100).toFixed(0);
  const items = tc.data.length;
  const tag = cases.indexOf(tc) < 3 ? "" : " [NEW]";

  console.log(`  ${(tc.name + tag).padEnd(35)} ${items.toString().padStart(4)} items  ours ${ot.toFixed(1).padStart(6)}ms  native ${nt.toFixed(1).padStart(6)}ms (${vsN.padStart(4)}%)  fjs ${ft.toFixed(1).padStart(6)}ms (${vsF.padStart(4)}%)`);
}

console.log("");
console.log("=== aggregate ===");
console.log(`  ours:   ${oursAgg.toFixed(1)}ms`);
console.log(`  native: ${nativeAgg.toFixed(1)}ms  (ours ${(((nativeAgg - oursAgg) / nativeAgg) * 100).toFixed(0)}% faster)`);
console.log(`  fjs:    ${fjsAgg.toFixed(1)}ms  (ours ${(((fjsAgg - oursAgg) / fjsAgg) * 100).toFixed(0)}% faster)`);
