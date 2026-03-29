// Optimized glob matcher — hand-rolled segment-based matching.
// Two-phase design:
// 1. compile(pattern) — parse a glob pattern into a matcher
// 2. matcher(path) — test a path against the compiled pattern

export type Matcher = (path: string) => boolean;

export function compile(pattern: string): Matcher {
  // Try fast paths first (no braces)
  const fast = tryFastPath(pattern);
  if (fast) return fast;

  // Try brace expansion with specialized multi-suffix matchers
  const expanded = expandBraces(pattern);
  if (expanded) {
    // Check if all expanded patterns are **/*.suffix
    {
      const suffixes: string[] = [];
      let ok = true;
      for (const p of expanded) {
        const gs = matchGlobstarSlashStarSuffix(p);
        if (gs !== null) { suffixes.push(gs); } else { ok = false; break; }
      }
      if (ok) {
        return (path: string) => {
          let anySuffix = false;
          for (let i = 0; i < suffixes.length; i++) {
            if (path.endsWith(suffixes[i])) { anySuffix = true; break; }
          }
          if (!anySuffix) return false;
          return !hasHiddenSegment(path);
        };
      }
    }

    // Check if all expanded patterns are prefix/**/*.suffix with same prefix
    {
      const suffixes: string[] = [];
      let ok = true;
      let commonPrefix = "";
      for (const p of expanded) {
        const pgs = matchPrefixGlobstarSuffix(p);
        if (pgs !== null) {
          if (commonPrefix === "") commonPrefix = pgs.prefix;
          else if (commonPrefix !== pgs.prefix) { ok = false; break; }
          suffixes.push(pgs.suffix);
        } else { ok = false; break; }
      }
      if (ok && commonPrefix !== "") {
        const prefixSlash = commonPrefix + "/";
        const prefixLen = commonPrefix.length + 1;
        return (path: string) => {
          if (!path.startsWith(prefixSlash)) return false;
          let anySuffix = false;
          for (let i = 0; i < suffixes.length; i++) {
            if (path.endsWith(suffixes[i])) { anySuffix = true; break; }
          }
          if (!anySuffix) return false;
          return !hasHiddenSegment(path.substring(prefixLen));
        };
      }
    }

    // Generic brace expansion: try fast paths for each
    const matchers = expanded.map(p => tryFastPath(p));
    if (matchers.every(m => m !== null)) {
      const fns = matchers as Matcher[];
      return (path: string) => {
        for (let i = 0; i < fns.length; i++) {
          if (fns[i](path)) return true;
        }
        return false;
      };
    }
  }

  // Fall back to regex for complex patterns
  const regex = globToRegex(pattern);
  return (path: string) => regex.test(path);
}

export function isMatch(path: string, pattern: string): boolean {
  return compile(pattern)(path);
}

// Check if any segment of a path starts with a dot
function hasHiddenSegment(path: string): boolean {
  // Check first char
  if (path.charCodeAt(0) === 46) return true;
  // Look for /. pattern — use indexOf which is native and fast
  return path.indexOf("/.") !== -1;
}

// Check if path segment (from start to end exclusive) starts with dot
function segmentStartsDot(path: string, start: number): boolean {
  return start < path.length && path.charCodeAt(start) === 46;
}

function tryFastPath(pattern: string): Matcher | null {
  // Pattern: **/*.ext or **/*.foo.bar (globstar + slash + star + literal suffix)
  {
    const m = matchGlobstarSlashStarSuffix(pattern);
    if (m !== null) {
      const suffix = m;
      const suffixLen = suffix.length;
      return (path: string) => {
        // Must end with suffix
        if (!path.endsWith(suffix)) return false;
        // The char before suffix must be a non-dot, non-slash char OR suffix starts at position 0
        // Actually: the filename part (after last /) must not start with dot
        // and no hidden segments in the path
        if (hasHiddenSegment(path)) return false;
        // The character at the start of the basename must not be a dot
        // suffix includes the dot (e.g. ".ts"), so we need to check the last segment
        // The * before the suffix matches [^/]* (no leading dot)
        // Find the last / before the suffix match
        const matchStart = path.length - suffixLen;
        // Find the start of the segment containing matchStart
        let segStart = matchStart;
        while (segStart > 0 && path.charCodeAt(segStart - 1) !== 47) segStart--;
        // The segment must not start with dot (handled by hasHiddenSegment above)
        return true;
      };
    }
  }

  // Pattern: dir/**/*.ext
  {
    const m = matchPrefixGlobstarSuffix(pattern);
    if (m !== null) {
      const { prefix, suffix } = m;
      const prefixSlash = prefix + "/";
      return (path: string) => {
        if (!path.startsWith(prefixSlash)) return false;
        if (!path.endsWith(suffix)) return false;
        // Check no hidden segments after prefix
        const rest = path.substring(prefix.length + 1);
        if (hasHiddenSegment(rest)) return false;
        return true;
      };
    }
  }

  // Pattern: dir/** (match everything under dir, no hidden segments)
  {
    const m = matchDirGlobstar(pattern);
    if (m !== null) {
      const prefix = m;
      const prefixSlash = prefix + "/";
      return (path: string) => {
        if (!path.startsWith(prefixSlash)) return false;
        // Check no hidden segments in the rest
        const rest = path.substring(prefixSlash.length);
        if (hasHiddenSegment(rest)) return false;
        return true;
      };
    }
  }

  // Pattern: dir/*.ext (single star, no directory traversal)
  {
    const m = matchDirStarSuffix(pattern);
    if (m !== null) {
      const { prefix, suffix } = m;
      const prefixSlash = prefix + "/";
      return (path: string) => {
        if (!path.startsWith(prefixSlash)) return false;
        if (!path.endsWith(suffix)) return false;
        // Must be single segment after prefix (no more slashes)
        const rest = path.substring(prefixSlash.length);
        if (rest.indexOf("/") !== -1) return false;
        // Must not start with dot
        if (rest.charCodeAt(0) === 46) return false;
        return true;
      };
    }
  }

  // Pattern: dir/????.ext (prefix + ? chars + suffix, single segment)
  {
    const m = matchDirQuestionSuffix(pattern);
    if (m !== null) {
      const { prefix, qCount, suffix } = m;
      const prefixSlash = prefix + "/";
      const totalLen = prefixSlash.length + qCount + suffix.length;
      return (path: string) => {
        if (path.length !== totalLen) return false;
        if (!path.startsWith(prefixSlash)) return false;
        if (!path.endsWith(suffix)) return false;
        // The ? chars must not be / or leading dot
        const qStart = prefixSlash.length;
        if (path.charCodeAt(qStart) === 46) return false; // leading dot
        for (let i = qStart; i < qStart + qCount; i++) {
          if (path.charCodeAt(i) === 47) return false; // no slashes
        }
        return true;
      };
    }
  }

  // Pattern: prefix/**/literal.* (e.g. src/**/index.*)
  {
    const m = matchPrefixGlobstarLiteralDotStar(pattern);
    if (m !== null) {
      const { prefix, literal } = m;
      const prefixSlash = prefix + "/";
      const literalDot = literal + ".";
      return (path: string) => {
        if (!path.startsWith(prefixSlash)) return false;
        // Find the last / in path to get basename
        const lastSlash = path.lastIndexOf("/");
        const basename = path.substring(lastSlash + 1);
        // basename must start with literal + "."
        if (!basename.startsWith(literalDot)) return false;
        // basename must have content after the dot (at least one char)
        if (basename.length <= literalDot.length) return false;
        // The extension part must not contain /
        // (it won't since we extracted from lastSlash)
        // No hidden segments in the path after prefix
        const rest = path.substring(prefix.length + 1);
        if (hasHiddenSegment(rest)) return false;
        return true;
      };
    }
  }

  // Pattern: **/*[charclass]*suffix (e.g. **/*[A-Z]*.tsx)
  {
    const m = matchGlobstarCharClassSuffix(pattern);
    if (m !== null) {
      const { charTest, suffix } = m;
      return (path: string) => {
        if (!path.endsWith(suffix)) return false;
        if (hasHiddenSegment(path)) return false;
        // Find the basename
        const lastSlash = path.lastIndexOf("/");
        const basenameStart = lastSlash + 1;
        // basename must not start with dot (already checked by hasHiddenSegment)
        // Need to find at least one char matching charTest in the basename (before suffix)
        const searchEnd = path.length - suffix.length;
        for (let i = basenameStart; i < searchEnd; i++) {
          if (charTest(path.charCodeAt(i))) return true;
        }
        return false;
      };
    }
  }

  return null;
}

// Match pattern like **/*.ts, **/*.test.ts
function matchGlobstarSlashStarSuffix(pattern: string): string | null {
  if (pattern.length < 5) return null; // minimum: **/*X
  if (pattern.charCodeAt(0) !== 42 || pattern.charCodeAt(1) !== 42 ||
      pattern.charCodeAt(2) !== 47 || pattern.charCodeAt(3) !== 42) return null;
  // Rest after ***/ must be a literal suffix (no glob chars)
  const suffix = pattern.substring(4);
  for (let i = 0; i < suffix.length; i++) {
    const c = suffix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  return suffix;
}

// Match pattern like dir/**/*.ts
function matchPrefixGlobstarSuffix(pattern: string): { prefix: string; suffix: string } | null {
  const dstarIdx = pattern.indexOf("/**/");
  if (dstarIdx < 0) return null;
  // prefix must be literal (no glob chars)
  const prefix = pattern.substring(0, dstarIdx);
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  // after /**/ must be * + literal suffix
  const after = pattern.substring(dstarIdx + 4);
  if (after.charCodeAt(0) !== 42) return null;
  const suffix = after.substring(1);
  for (let i = 0; i < suffix.length; i++) {
    const c = suffix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  return { prefix, suffix };
}

// Match pattern like dir/**
function matchDirGlobstar(pattern: string): string | null {
  if (!pattern.endsWith("/**")) return null;
  const prefix = pattern.substring(0, pattern.length - 3);
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  return prefix;
}

// Match pattern like dir/*.ext
function matchDirStarSuffix(pattern: string): { prefix: string; suffix: string } | null {
  const lastSlash = pattern.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const prefix = pattern.substring(0, lastSlash);
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  const segment = pattern.substring(lastSlash + 1);
  if (segment.charCodeAt(0) !== 42) return null;
  const suffix = segment.substring(1);
  for (let i = 0; i < suffix.length; i++) {
    const c = suffix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  return { prefix, suffix };
}

// Match pattern like dir/????.ext
function matchDirQuestionSuffix(pattern: string): { prefix: string; qCount: number; suffix: string } | null {
  const lastSlash = pattern.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const prefix = pattern.substring(0, lastSlash);
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  const segment = pattern.substring(lastSlash + 1);
  let qCount = 0;
  while (qCount < segment.length && segment.charCodeAt(qCount) === 63) qCount++;
  if (qCount === 0) return null;
  const suffix = segment.substring(qCount);
  for (let i = 0; i < suffix.length; i++) {
    const c = suffix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  return { prefix, qCount, suffix };
}

// Match pattern like prefix/**/literal.* (e.g. src/**/index.*)
function matchPrefixGlobstarLiteralDotStar(pattern: string): { prefix: string; literal: string } | null {
  const dstarIdx = pattern.indexOf("/**/");
  if (dstarIdx < 0) return null;
  const prefix = pattern.substring(0, dstarIdx);
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  const after = pattern.substring(dstarIdx + 4);
  // after must be "literal.*" (literal + dot + star, no other globs)
  if (!after.endsWith(".*")) return null;
  const literal = after.substring(0, after.length - 2);
  // literal must be purely literal
  for (let i = 0; i < literal.length; i++) {
    const c = literal.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92 || c === 47) return null;
  }
  return { prefix, literal };
}

// Match pattern like **/*[A-Z]*.tsx
function matchGlobstarCharClassSuffix(pattern: string): { charTest: (code: number) => boolean; suffix: string } | null {
  // Must start with **/*
  if (pattern.length < 7) return null;
  if (pattern.charCodeAt(0) !== 42 || pattern.charCodeAt(1) !== 42 ||
      pattern.charCodeAt(2) !== 47 || pattern.charCodeAt(3) !== 42) return null;
  // Next must be [
  if (pattern.charCodeAt(4) !== 91) return null;
  // Find closing ]
  const closeIdx = pattern.indexOf("]", 5);
  if (closeIdx < 0) return null;
  // After ] must be * + literal suffix
  if (pattern.charCodeAt(closeIdx + 1) !== 42) return null;
  const suffix = pattern.substring(closeIdx + 2);
  // suffix must be literal
  for (let i = 0; i < suffix.length; i++) {
    const c = suffix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92) return null;
  }
  // Parse the character class
  const classBody = pattern.substring(5, closeIdx);
  const charTest = parseCharClass(classBody);
  if (!charTest) return null;
  return { charTest, suffix };
}

// Parse a character class body like "A-Z" or "abc" into a test function
function parseCharClass(body: string): ((code: number) => boolean) | null {
  const negated = body.startsWith("!");
  const chars = negated ? body.substring(1) : body;
  // Build ranges and individual chars
  const ranges: [number, number][] = [];
  const singles: number[] = [];
  let i = 0;
  while (i < chars.length) {
    if (i + 2 < chars.length && chars.charCodeAt(i + 1) === 45) {
      // Range like A-Z
      ranges.push([chars.charCodeAt(i), chars.charCodeAt(i + 2)]);
      i += 3;
    } else {
      singles.push(chars.charCodeAt(i));
      i++;
    }
  }
  if (negated) {
    return (code: number) => {
      for (let j = 0; j < ranges.length; j++) {
        if (code >= ranges[j][0] && code <= ranges[j][1]) return false;
      }
      for (let j = 0; j < singles.length; j++) {
        if (code === singles[j]) return false;
      }
      return true;
    };
  }
  return (code: number) => {
    for (let j = 0; j < ranges.length; j++) {
      if (code >= ranges[j][0] && code <= ranges[j][1]) return true;
    }
    for (let j = 0; j < singles.length; j++) {
      if (code === singles[j]) return true;
    }
    return false;
  };
}

// --- Brace expansion for fast paths ---

// Handle **/*.{ts,tsx} by expanding braces and creating multiple fast matchers
function expandBraces(pattern: string): string[] | null {
  const braceStart = pattern.indexOf("{");
  if (braceStart < 0) return null;
  const braceEnd = pattern.indexOf("}", braceStart);
  if (braceEnd < 0) return null;
  // Check no nested braces (simple case only)
  const inner = pattern.substring(braceStart + 1, braceEnd);
  if (inner.indexOf("{") >= 0) return null;
  const prefix = pattern.substring(0, braceStart);
  const suffix = pattern.substring(braceEnd + 1);
  const alternatives = inner.split(",");
  return alternatives.map(alt => prefix + alt + suffix);
}

// --- Regex fallback ---

function globToRegex(pattern: string): RegExp {
  let result = "^";
  let i = 0;
  const len = pattern.length;

  while (i < len) {
    const ch = pattern[i];

    if (ch === "\\") {
      i++;
      if (i < len) {
        result += escapeRegex(pattern[i]);
        i++;
      }
    } else if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          result += "(?:(?:(?!(?:\\/|^)\\.).)*\\/)?";
          i += 3;
        } else {
          result += "(?:(?!(?:\\/|^)\\.).)*";
          i += 2;
        }
      } else {
        const atSegStart = i === 0 || pattern[i - 1] === "/";
        if (atSegStart) {
          result += "(?!\\.)";
        }
        result += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      const atSegStart = i === 0 || pattern[i - 1] === "/";
      if (atSegStart) {
        result += "(?!\\.)";
      }
      result += "[^/]";
      i++;
    } else if (ch === "[") {
      i++;
      let cls = "";
      if (i < len && pattern[i] === "!") {
        cls += "^";
        i++;
      }
      while (i < len && pattern[i] !== "]") {
        if (pattern[i] === "\\") {
          i++;
          if (i < len) cls += escapeRegex(pattern[i]);
        } else {
          cls += escapeRegex(pattern[i]);
        }
        i++;
      }
      result += `[${cls}]`;
      i++;
    } else if (ch === "{") {
      i++;
      const alternatives: string[] = [];
      let current = "";
      let depth = 1;
      while (i < len && depth > 0) {
        if (pattern[i] === "{") {
          depth++;
          current += pattern[i];
        } else if (pattern[i] === "}") {
          depth--;
          if (depth === 0) {
            alternatives.push(current);
          } else {
            current += pattern[i];
          }
        } else if (pattern[i] === "," && depth === 1) {
          alternatives.push(current);
          current = "";
        } else if (pattern[i] === "\\") {
          i++;
          if (i < len) current += "\\" + pattern[i];
        } else {
          current += pattern[i];
        }
        i++;
      }
      const fragments = alternatives.map(alt => {
        const altRegex = globToRegex(alt);
        return altRegex.source.slice(1, -1);
      });
      result += `(?:${fragments.join("|")})`;
    } else {
      result += escapeRegex(ch);
      i++;
    }
  }

  result += "$";
  return new RegExp(result);
}

function escapeRegex(ch: string): string {
  if (".+*?^${}()|[]\\/".includes(ch)) {
    return "\\" + ch;
  }
  return ch;
}
