// Real-world glob benchmarks — patterns from actual build tool configs.

import { compile } from "./src/glob.ts";
import picomatch from "picomatch";

// Simulate a real project's file tree
function generateProjectTree(count: number): string[] {
  const paths: string[] = [];
  const dirs = [
    "src", "src/components", "src/components/ui", "src/components/forms",
    "src/lib", "src/lib/utils", "src/hooks", "src/pages", "src/pages/api",
    "src/pages/api/auth", "src/styles", "src/types", "src/server",
    "src/server/routes", "src/server/middleware",
    "app", "app/(auth)", "app/(dashboard)", "app/api", "app/api/webhooks",
    "lib", "lib/db", "lib/auth", "lib/email",
    "components", "components/ui", "components/shared",
    "test", "test/unit", "test/integration", "test/e2e", "test/__fixtures__",
    "scripts", "docs", "docs/api", "public", "public/images",
    ".github", ".github/workflows",
    "node_modules/react", "node_modules/react/cjs",
    "node_modules/next/dist", "node_modules/next/dist/client",
    "node_modules/@types/react",
  ];
  const files = [
    "index.ts", "index.tsx", "page.tsx", "layout.tsx", "loading.tsx",
    "Button.tsx", "Modal.tsx", "Form.tsx", "Input.tsx", "Select.tsx",
    "utils.ts", "helpers.ts", "config.ts", "constants.ts", "types.ts",
    "schema.ts", "validation.ts", "auth.ts", "db.ts", "api.ts",
    "route.ts", "middleware.ts", "handler.ts",
    "index.test.ts", "utils.test.ts", "Button.test.tsx",
    "styles.css", "globals.css", "tailwind.css",
    "package.json", "tsconfig.json", "README.md", ".env", ".env.local",
    "index.js", "index.mjs", "index.d.ts",
  ];

  let s = 42;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  for (let i = 0; i < count; i++) {
    const dir = dirs[(rng() * dirs.length) | 0];
    const file = files[(rng() * files.length) | 0];
    paths.push(`${dir}/${file}`);
  }
  return paths;
}

const paths = generateProjectTree(10000);
const ITERATIONS = 100;

// Patterns from real tool configs
const scenarios = [
  // Vite/Rollup include
  { name: "vite include", pattern: "src/**/*.{ts,tsx}" },
  // ESLint files
  { name: "eslint ts files", pattern: "**/*.{ts,tsx,js,jsx}" },
  // Jest testMatch
  { name: "jest tests", pattern: "**/*.test.{ts,tsx}" },
  // Tailwind content
  { name: "tailwind content", pattern: "**/*.{tsx,jsx,html}" },
  // gitignore-style
  { name: "node_modules", pattern: "node_modules/**" },
  // Next.js page files
  { name: "next pages", pattern: "app/**/page.tsx" },
  // Type definitions
  { name: "type defs", pattern: "**/*.d.ts" },
  // Config files
  { name: "config files", pattern: "*.{json,js,ts,mjs}" },
  // Negation (exclude tests)
  { name: "negation", pattern: "!**/*.test.*" },
  // CSS files in src
  { name: "src css", pattern: "src/**/*.css" },
  // Deep specific path
  { name: "api routes", pattern: "src/pages/api/**/*.ts" },
  // Simple star
  { name: "root files", pattern: "*.ts" },
];

function bench(name: string, compileFn: (p: string) => (s: string) => boolean) {
  const matchers = scenarios.map(s => ({
    name: s.name,
    matcher: compileFn(s.pattern),
    paths,
  }));

  // Warmup
  for (let i = 0; i < 5; i++) {
    for (const m of matchers) {
      for (const p of m.paths) m.matcher(p);
    }
  }

  // Total
  const times: number[] = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      for (const m of matchers) {
        for (const p of m.paths) m.matcher(p);
      }
    }
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);

  const totalOps = scenarios.length * paths.length * ITERATIONS;
  const mops = totalOps / (times[2] * 1000);
  console.log(`  ${name.padEnd(16)} median ${times[2].toFixed(1).padStart(8)}ms  (${mops.toFixed(1)} Mops/s)`);
  return times[2];
}

console.log(`=== real-world patterns (${scenarios.length} patterns, ${paths.length} paths, ${ITERATIONS} iters) ===`);
console.log("");
const oursTime = bench("ours", compile);
const picoTime = bench("picomatch", (p: string) => picomatch(p));
console.log("");

const pct = (((picoTime - oursTime) / picoTime) * 100).toFixed(0);
console.log(`  delta: ${pct}% faster`);
console.log("");

// Per-pattern breakdown
console.log("=== per-pattern breakdown (100 iters) ===");
for (const s of scenarios) {
  const ourMatcher = compile(s.pattern);
  const pmMatcher = picomatch(s.pattern);

  const os = performance.now();
  for (let i = 0; i < ITERATIONS; i++) for (const p of paths) ourMatcher(p);
  const oe = performance.now() - os;

  const ps = performance.now();
  for (let i = 0; i < ITERATIONS; i++) for (const p of paths) pmMatcher(p);
  const pe = performance.now() - ps;

  const delta = (((pe - oe) / pe) * 100).toFixed(0);
  console.log(
    `  ${s.name.padEnd(20)} ours ${oe.toFixed(1).padStart(7)}ms  pico ${pe.toFixed(1).padStart(7)}ms  ${delta.padStart(5)}% faster`,
  );
}
