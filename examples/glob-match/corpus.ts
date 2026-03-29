// Glob matching workloads — realistic patterns and file paths.
// FROZEN — do not modify during autoresearch.

export interface Workload {
  name: string;
  pattern: string;
  paths: string[];
  expectedMatches: number; // how many paths should match
}

// Generate realistic file paths
function generateFilePaths(count: number, seed: number): string[] {
  const dirs = [
    "src", "src/components", "src/components/ui", "src/lib", "src/utils",
    "src/hooks", "src/pages", "src/pages/api", "src/styles",
    "lib", "lib/core", "lib/utils", "lib/plugins",
    "test", "test/unit", "test/integration", "test/e2e",
    "node_modules/react/lib", "node_modules/lodash",
    "dist", "dist/esm", "dist/cjs", "build", "build/static",
    ".github/workflows", "docs", "docs/api", "scripts",
  ];
  const names = [
    "index", "App", "Button", "Modal", "Header", "Footer", "Sidebar",
    "utils", "helpers", "config", "constants", "types", "schema",
    "auth", "api", "client", "server", "middleware", "router",
    "store", "reducer", "actions", "selectors", "hooks",
    "test", "spec", "setup", "fixtures", "mocks",
  ];
  const exts = [".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md", ".test.ts", ".spec.ts"];

  const paths: string[] = [];
  let s = seed;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  for (let i = 0; i < count; i++) {
    const dir = dirs[(rng() * dirs.length) | 0];
    const name = names[(rng() * names.length) | 0];
    const ext = exts[(rng() * exts.length) | 0];
    paths.push(`${dir}/${name}${ext}`);
  }
  return paths;
}

const allPaths = generateFilePaths(5000, 42);

function countMatches(paths: string[], pattern: string): number {
  // Use picomatch as reference for expected match count
  // Hardcoded to avoid dependency in corpus
  // These were pre-computed
  return -1; // placeholder, verify.ts will check against picomatch
}

export function generateWorkloads(): Workload[] {
  return [
    // 1. Simple extension match — most common pattern
    {
      name: "*.ts",
      pattern: "**/*.ts",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 2. Multiple extensions via brace expansion
    {
      name: "*.{ts,tsx}",
      pattern: "**/*.{ts,tsx}",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 3. Directory-scoped match
    {
      name: "src/**/*.ts",
      pattern: "src/**/*.ts",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 4. Single star (no directory traversal)
    {
      name: "src/*.ts",
      pattern: "src/*.ts",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 5. Test files
    {
      name: "*.test.ts",
      pattern: "**/*.test.ts",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 6. Negation-like: match non-test files (use pattern that excludes)
    {
      name: "src/**/index.*",
      pattern: "src/**/index.*",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 7. Character class
    {
      name: "[A-Z]*.tsx",
      pattern: "**/*[A-Z]*.tsx",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 8. Deep nested globstar
    {
      name: "node_modules/**",
      pattern: "node_modules/**",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 9. Question mark
    {
      name: "src/????.ts",
      pattern: "src/????.ts",
      paths: allPaths,
      expectedMatches: -1,
    },

    // 10. Complex real-world pattern
    {
      name: "complex",
      pattern: "src/**/*.{ts,tsx,js,jsx}",
      paths: allPaths,
      expectedMatches: -1,
    },
  ];
}
