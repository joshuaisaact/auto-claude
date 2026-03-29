// Optimized glob matcher — hand-rolled segment-based matching.
// Two-phase design:
// 1. compile(pattern) — parse a glob pattern into a matcher
// 2. matcher(path) — test a path against the compiled pattern

export type Matcher = (path: string) => boolean;

export interface GlobOptions {
  /** When true, allow matching dotfiles (skip hidden segment checks) */
  dot?: boolean;
  /** Case-insensitive matching */
  nocase?: boolean;
  /** If pattern has no slashes, match against basename only */
  matchBase?: boolean;
  /** Patterns to exclude from matching */
  ignore?: string | string[];
}

export function compile(pattern: string, options?: GlobOptions): Matcher {
  const opts = options ?? {};

  // Negation: !pattern means match everything except what the pattern matches
  // But !(...) is an extglob, not negation
  if (pattern.length > 1 && pattern.charCodeAt(0) === 33 /* ! */ && pattern.charCodeAt(1) !== 40 /* ( */) {
    const inner = compile(pattern.substring(1), opts);
    return (path: string) => !inner(path);
  }

  // matchBase: if pattern has no slashes, match against basename only
  if (opts.matchBase && pattern.indexOf("/") === -1) {
    const baseMatcher = compileCore(pattern, opts);
    return (path: string) => {
      const lastSlash = path.lastIndexOf("/");
      const basename = lastSlash === -1 ? path : path.substring(lastSlash + 1);
      return baseMatcher(basename);
    };
  }

  const matcher = compileCore(pattern, opts);

  // ignore: compile ignore patterns and exclude matches
  if (opts.ignore) {
    const ignorePatterns = typeof opts.ignore === "string" ? [opts.ignore] : opts.ignore;
    const ignoreMatchers = ignorePatterns.map(p => compileCore(p, opts));
    return (path: string) => {
      if (!matcher(path)) return false;
      for (let i = 0; i < ignoreMatchers.length; i++) {
        if (ignoreMatchers[i](path)) return false;
      }
      return true;
    };
  }

  return matcher;
}

/** Core compilation without negation/matchBase/ignore wrapping */
function compileCore(pattern: string, opts: GlobOptions): Matcher {
  const dot = opts.dot === true;
  const nocase = opts.nocase === true;

  // Try fast paths first (no braces, no extglobs)
  if (!nocase) {
    const fast = tryFastPath(pattern, dot);
    if (fast) return fast;
  }

  // Try brace expansion with specialized multi-suffix matchers
  const expanded = expandBraces(pattern);
  if (expanded) {
    if (!nocase) {
      // Check if all expanded patterns are **/*.suffix
      {
        const suffixes: string[] = [];
        let ok = true;
        for (const p of expanded) {
          const gs = matchGlobstarSlashStarSuffix(p);
          if (gs !== null) { suffixes.push(gs); } else { ok = false; break; }
        }
        if (ok) {
          // Build a single function that checks all suffixes without loop overhead
          const suffixCheck = buildMultiSuffixCheck(suffixes);
          if (dot) {
            return (path: string) => suffixCheck(path);
          }
          return (path: string) => {
            if (!suffixCheck(path)) return false;
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
          const checkFrom = commonPrefix.length + 1;
          const prefCodes = makeCodes(commonPrefix + "/");
          const suffixCheck = buildMultiSuffixCheck(suffixes);
          if (dot) {
            return (path: string) => {
              if (!startsWithCodes(path, prefCodes)) return false;
              return suffixCheck(path);
            };
          }
          return (path: string) => {
            if (!startsWithCodes(path, prefCodes)) return false;
            if (!suffixCheck(path)) return false;
            return !hasHiddenSegmentFrom(path, checkFrom);
          };
        }
      }

      // Generic brace expansion: try fast paths for each
      {
        const matchers = expanded.map(p => tryFastPath(p, dot));
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
    }

    // Fallback: compile each expanded pattern individually
    const fns = expanded.map(p => compileCore(p, opts));
    return (path: string) => {
      for (let i = 0; i < fns.length; i++) {
        if (fns[i](path)) return true;
      }
      return false;
    };
  }

  // Fall back to regex for complex patterns
  const regex = globToRegex(pattern, dot, nocase);
  return (path: string) => regex.test(path);
}

export function isMatch(path: string, pattern: string, options?: GlobOptions): boolean {
  return compile(pattern, options)(path);
}

// Check if any segment of a path starts with a dot
function hasHiddenSegment(path: string): boolean {
  if (path.charCodeAt(0) === 46) return true;
  return path.indexOf("/.") !== -1;
}

// Check if any segment starting from offset starts with a dot
function hasHiddenSegmentFrom(path: string, from: number): boolean {
  if (path.charCodeAt(from) === 46) return true;
  return path.indexOf("/.", from) !== -1;
}

// Pre-compute char codes for fast comparison
function makeCodes(s: string): Uint16Array {
  const codes = new Uint16Array(s.length);
  for (let i = 0; i < s.length; i++) codes[i] = s.charCodeAt(i);
  return codes;
}

// Check if path ends with suffix using pre-computed char codes
function endsWithCodes(path: string, codes: Uint16Array): boolean {
  const pLen = path.length;
  const sLen = codes.length;
  if (pLen < sLen) return false;
  const offset = pLen - sLen;
  for (let i = 0; i < sLen; i++) {
    if (path.charCodeAt(offset + i) !== codes[i]) return false;
  }
  return true;
}

// Check if path starts with prefix using pre-computed char codes
function startsWithCodes(path: string, codes: Uint16Array): boolean {
  const pLen = path.length;
  const sLen = codes.length;
  if (pLen < sLen) return false;
  for (let i = 0; i < sLen; i++) {
    if (path.charCodeAt(i) !== codes[i]) return false;
  }
  return true;
}

function tryFastPath(pattern: string, dot: boolean): Matcher | null {
  // Pattern: **/*.ext or **/*.foo.bar (globstar + slash + star + literal suffix)
  {
    const m = matchGlobstarSlashStarSuffix(pattern);
    if (m !== null) {
      const codes = makeCodes(m);
      if (dot) {
        return (path: string) => endsWithCodes(path, codes);
      }
      return (path: string) => {
        if (!endsWithCodes(path, codes)) return false;
        return !hasHiddenSegment(path);
      };
    }
  }

  // Pattern: dir/**/*.ext
  {
    const m = matchPrefixGlobstarSuffix(pattern);
    if (m !== null) {
      const { prefix, suffix } = m;
      const checkFrom = prefix.length + 1;
      const prefCodes = makeCodes(prefix + "/");
      const sufCodes = makeCodes(suffix);
      if (dot) {
        return (path: string) => {
          if (!startsWithCodes(path, prefCodes)) return false;
          return endsWithCodes(path, sufCodes);
        };
      }
      return (path: string) => {
        if (!startsWithCodes(path, prefCodes)) return false;
        if (!endsWithCodes(path, sufCodes)) return false;
        return !hasHiddenSegmentFrom(path, checkFrom);
      };
    }
  }

  // Pattern: dir/** (match everything under dir, no hidden segments)
  {
    const m = matchDirGlobstar(pattern);
    if (m !== null) {
      const prefix = m;
      const prefixSlash = prefix + "/";
      const checkFrom = prefixSlash.length;
      const prefCodes = makeCodes(prefixSlash);
      if (dot) {
        return (path: string) => startsWithCodes(path, prefCodes);
      }
      return (path: string) => {
        if (!startsWithCodes(path, prefCodes)) return false;
        return !hasHiddenSegmentFrom(path, checkFrom);
      };
    }
  }

  // Pattern: dir/*.ext (single star, no directory traversal)
  {
    const m = matchDirStarSuffix(pattern);
    if (m !== null) {
      const { prefix, suffix } = m;
      const prefixSlash = prefix + "/";
      const checkFrom = prefixSlash.length;
      const prefCodes = makeCodes(prefixSlash);
      const sufCodes = makeCodes(suffix);
      if (dot) {
        return (path: string) => {
          if (!startsWithCodes(path, prefCodes)) return false;
          if (!endsWithCodes(path, sufCodes)) return false;
          if (path.indexOf("/", checkFrom) !== -1) return false;
          return true;
        };
      }
      return (path: string) => {
        if (!startsWithCodes(path, prefCodes)) return false;
        if (!endsWithCodes(path, sufCodes)) return false;
        // Must be single segment after prefix (no more slashes)
        // Check no / after prefix
        if (path.indexOf("/", checkFrom) !== -1) return false;
        // Must not start with dot
        if (path.charCodeAt(checkFrom) === 46) return false;
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
      const prefCodes = makeCodes(prefixSlash);
      const sufCodes = makeCodes(suffix);
      const totalLen = prefixSlash.length + qCount + suffix.length;
      if (dot) {
        return (path: string) => {
          if (path.length !== totalLen) return false;
          if (!startsWithCodes(path, prefCodes)) return false;
          if (!endsWithCodes(path, sufCodes)) return false;
          const qStart = prefixSlash.length;
          for (let i = qStart; i < qStart + qCount; i++) {
            if (path.charCodeAt(i) === 47) return false;
          }
          return true;
        };
      }
      return (path: string) => {
        if (path.length !== totalLen) return false;
        if (!startsWithCodes(path, prefCodes)) return false;
        if (!endsWithCodes(path, sufCodes)) return false;
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
      const prefCodes = makeCodes(prefix + "/");
      const literalDot = literal + ".";
      const literalDotLen = literalDot.length;
      const checkFrom = prefix.length + 1;
      if (dot) {
        return (path: string) => {
          if (!startsWithCodes(path, prefCodes)) return false;
          const lastSlash = path.lastIndexOf("/");
          const bnStart = lastSlash + 1;
          if (path.length - bnStart <= literalDotLen) return false;
          for (let k = 0; k < literalDotLen; k++) {
            if (path.charCodeAt(bnStart + k) !== literalDot.charCodeAt(k)) return false;
          }
          return true;
        };
      }
      return (path: string) => {
        if (!startsWithCodes(path, prefCodes)) return false;
        // Find the last / in path to get basename start
        const lastSlash = path.lastIndexOf("/");
        const bnStart = lastSlash + 1;
        // Check basename starts with literal + "."
        // Compare char by char to avoid substring allocation
        if (path.length - bnStart <= literalDotLen) return false;
        for (let k = 0; k < literalDotLen; k++) {
          if (path.charCodeAt(bnStart + k) !== literalDot.charCodeAt(k)) return false;
        }
        return !hasHiddenSegmentFrom(path, checkFrom);
      };
    }
  }

  // Pattern: *.ext (root-level star + literal suffix, no directory)
  {
    const m = matchRootStarSuffix(pattern);
    if (m !== null) {
      const codes = makeCodes(m);
      if (dot) {
        return (path: string) => {
          if (path.indexOf("/") !== -1) return false;
          return endsWithCodes(path, codes);
        };
      }
      return (path: string) => {
        if (path.indexOf("/") !== -1) return false;
        if (path.charCodeAt(0) === 46) return false;
        return endsWithCodes(path, codes);
      };
    }
  }

  // Pattern: **/*.literal.* or **/literal.* (globstar + fixed middle + wildcard ext)
  {
    const m = matchGlobstarLiteralDotStar(pattern);
    if (m !== null) {
      const litDotCodes = makeCodes(m);
      if (dot) {
        return (path: string) => {
          // Find basename
          const lastSlash = path.lastIndexOf("/");
          const bnStart = lastSlash + 1;
          // Basename must contain the literal. prefix somewhere followed by a dot and at least one char
          const remaining = path.length - bnStart;
          if (remaining <= litDotCodes.length) return false;
          // Check if basename contains the literal. prefix
          const offset = bnStart;
          for (let i = 0; i <= remaining - litDotCodes.length; i++) {
            let match = true;
            for (let j = 0; j < litDotCodes.length; j++) {
              if (path.charCodeAt(offset + i + j) !== litDotCodes[j]) { match = false; break; }
            }
            if (match) return true;
          }
          return false;
        };
      }
      return (path: string) => {
        if (hasHiddenSegment(path)) return false;
        const lastSlash = path.lastIndexOf("/");
        const bnStart = lastSlash + 1;
        const remaining = path.length - bnStart;
        if (remaining <= litDotCodes.length) return false;
        const offset = bnStart;
        for (let i = 0; i <= remaining - litDotCodes.length; i++) {
          let match = true;
          for (let j = 0; j < litDotCodes.length; j++) {
            if (path.charCodeAt(offset + i + j) !== litDotCodes[j]) { match = false; break; }
          }
          if (match) return true;
        }
        return false;
      };
    }
  }

  // Pattern: **/*[charclass]*suffix (e.g. **/*[A-Z]*.tsx)
  {
    const m = matchGlobstarCharClassSuffix(pattern);
    if (m !== null) {
      const { charTest, suffix } = m;
      const codes = makeCodes(suffix);
      if (dot) {
        return (path: string) => {
          if (!endsWithCodes(path, codes)) return false;
          const lastSlash = path.lastIndexOf("/");
          const basenameStart = lastSlash + 1;
          const searchEnd = path.length - suffix.length;
          for (let i = basenameStart; i < searchEnd; i++) {
            if (charTest(path.charCodeAt(i))) return true;
          }
          return false;
        };
      }
      return (path: string) => {
        if (!endsWithCodes(path, codes)) return false;
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

// Match pattern like *.ext (root-level, no directories)
function matchRootStarSuffix(pattern: string): string | null {
  if (pattern.length < 2) return null;
  if (pattern.charCodeAt(0) !== 42) return null; // must start with *
  // Check for extglob: *( is *(pattern) not star+paren
  if (pattern.charCodeAt(1) === 40) return null;
  if (pattern.indexOf("/") !== -1) return null; // no slashes
  const suffix = pattern.substring(1);
  for (let i = 0; i < suffix.length; i++) {
    const c = suffix.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92 || c === 40) return null;
  }
  return suffix;
}

// Match pattern like **/*.test.* or **/literal.* (globstar + star + literal + .*)
// Returns the literal. prefix to search for in the basename (e.g. ".test.")
function matchGlobstarLiteralDotStar(pattern: string): string | null {
  // Must start with **/*
  if (pattern.length < 6) return null;
  if (pattern.charCodeAt(0) !== 42 || pattern.charCodeAt(1) !== 42 ||
      pattern.charCodeAt(2) !== 47 || pattern.charCodeAt(3) !== 42) return null;
  // Must end with .*
  if (pattern.charCodeAt(pattern.length - 1) !== 42 ||
      pattern.charCodeAt(pattern.length - 2) !== 46) return null;
  // Middle part (between **/* and .*) must be a literal
  const middle = pattern.substring(4, pattern.length - 2);
  for (let i = 0; i < middle.length; i++) {
    const c = middle.charCodeAt(i);
    if (c === 42 || c === 63 || c === 91 || c === 123 || c === 92 || c === 47) return null;
  }
  // Return the search string: middle + "."
  return middle + ".";
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

// Build an efficient multi-suffix check. Uses the last char to discriminate.
function buildMultiSuffixCheck(suffixes: string[]): (path: string) => boolean {
  if (suffixes.length === 1) {
    const s = suffixes[0];
    const codes = makeCodes(s);
    return (path: string) => endsWithCodes(path, codes);
  }
  if (suffixes.length === 2) {
    const c0 = makeCodes(suffixes[0]);
    const c1 = makeCodes(suffixes[1]);
    const last0 = c0[c0.length - 1];
    const last1 = c1[c1.length - 1];
    if (last0 !== last1) {
      // Different last chars: use as fast discriminator
      return (path: string) => {
        const last = path.charCodeAt(path.length - 1);
        if (last === last0) return endsWithCodes(path, c0);
        if (last === last1) return endsWithCodes(path, c1);
        return false;
      };
    }
    return (path: string) => endsWithCodes(path, c0) || endsWithCodes(path, c1);
  }
  // General case: group by last char code for fast discrimination
  const allCodes = suffixes.map(makeCodes);
  // Check if all suffixes have unique last chars
  const lastChars = allCodes.map(c => c[c.length - 1]);
  const uniqueLastChars = new Set(lastChars);
  if (uniqueLastChars.size === allCodes.length) {
    // Build a Map for O(1) last-char dispatch
    const byLast = new Map<number, Uint16Array>();
    for (let i = 0; i < allCodes.length; i++) {
      byLast.set(lastChars[i], allCodes[i]);
    }
    return (path: string) => {
      const last = path.charCodeAt(path.length - 1);
      const codes = byLast.get(last);
      if (codes === undefined) return false;
      return endsWithCodes(path, codes);
    };
  }
  return (path: string) => {
    for (let i = 0; i < allCodes.length; i++) {
      if (endsWithCodes(path, allCodes[i])) return true;
    }
    return false;
  };
}

// --- Brace expansion for fast paths ---

// Handle **/*.{ts,tsx} by expanding braces and creating multiple fast matchers.
// Also handles brace ranges like {1..5}, {a..z}, {01..05}.
function expandBraces(pattern: string): string[] | null {
  const braceStart = pattern.indexOf("{");
  if (braceStart < 0) return null;
  const braceEnd = findMatchingBrace(pattern, braceStart);
  if (braceEnd < 0) return null;
  const inner = pattern.substring(braceStart + 1, braceEnd);
  const prefix = pattern.substring(0, braceStart);
  const suffix = pattern.substring(braceEnd + 1);

  // Check for range pattern: {start..end}
  // picomatch only expands ranges without leading zeros
  const rangeMatch = inner.match(/^(-?\d+)\.\.(-?\d+)$/);
  if (rangeMatch) {
    const startStr = rangeMatch[1];
    const endStr = rangeMatch[2];
    // Skip ranges with leading zeros — picomatch treats them as literal
    const hasLeadingZero = (startStr.length > 1 && startStr.charCodeAt(0) === 48) ||
                           (endStr.length > 1 && endStr.charCodeAt(0) === 48);
    if (!hasLeadingZero) {
      const startVal = parseInt(startStr, 10);
      const endVal = parseInt(endStr, 10);
      const step = startVal <= endVal ? 1 : -1;
      const alternatives: string[] = [];
      for (let v = startVal; step > 0 ? v <= endVal : v >= endVal; v += step) {
        alternatives.push(String(v));
      }
      const expanded = alternatives.map(alt => prefix + alt + suffix);
      // Recursively expand remaining braces in suffix
      if (suffix.indexOf("{") >= 0) {
        const result: string[] = [];
        for (const e of expanded) {
          const sub = expandBraces(e);
          if (sub) result.push(...sub);
          else result.push(e);
        }
        return result;
      }
      return expanded;
    }
  }

  // Check for alpha range: {a..z}
  const alphaMatch = inner.match(/^([a-zA-Z])\.\.([a-zA-Z])$/);
  if (alphaMatch) {
    const startCode = alphaMatch[1].charCodeAt(0);
    const endCode = alphaMatch[2].charCodeAt(0);
    const step = startCode <= endCode ? 1 : -1;
    const alternatives: string[] = [];
    for (let c = startCode; step > 0 ? c <= endCode : c >= endCode; c += step) {
      alternatives.push(String.fromCharCode(c));
    }
    const expanded = alternatives.map(alt => prefix + alt + suffix);
    if (suffix.indexOf("{") >= 0) {
      const result: string[] = [];
      for (const e of expanded) {
        const sub = expandBraces(e);
        if (sub) result.push(...sub);
        else result.push(e);
      }
      return result;
    }
    return expanded;
  }

  // Check no nested braces in this segment (simple comma-separated case)
  if (inner.indexOf("{") >= 0) {
    // Nested braces — need recursive expansion
    // Split by comma at depth 0
    const alternatives = splitAtCommas(inner);
    // Recursively expand each alternative
    const allExpanded: string[] = [];
    for (const alt of alternatives) {
      const full = prefix + alt + suffix;
      const sub = expandBraces(full);
      if (sub) allExpanded.push(...sub);
      else allExpanded.push(full);
    }
    return allExpanded;
  }

  const alternatives = inner.split(",");
  const expanded = alternatives.map(alt => prefix + alt + suffix);

  // Recursively expand remaining braces in suffix
  if (suffix.indexOf("{") >= 0) {
    const result: string[] = [];
    for (const e of expanded) {
      const sub = expandBraces(e);
      if (sub) result.push(...sub);
      else result.push(e);
    }
    return result;
  }

  return expanded;
}

/** Find matching closing brace, handling nesting */
function findMatchingBrace(pattern: string, start: number): number {
  let depth = 0;
  for (let i = start; i < pattern.length; i++) {
    if (pattern.charCodeAt(i) === 123) depth++;
    else if (pattern.charCodeAt(i) === 125) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split string by commas at depth 0 (respecting nested braces) */
function splitAtCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 123) { depth++; current += s[i]; }
    else if (ch === 125) { depth--; current += s[i]; }
    else if (ch === 44 && depth === 0) { parts.push(current); current = ""; }
    else { current += s[i]; }
  }
  parts.push(current);
  return parts;
}

// --- Regex fallback ---

function globToRegex(pattern: string, dot: boolean = false, nocase: boolean = false): RegExp {
  // Require at least one character (picomatch never matches empty strings)
  let result = "^(?=.)";
  let i = 0;
  const len = pattern.length;

  // Helper to check if we're at start of a path segment
  const atSegStart = (pos: number) => pos === 0 || pattern[pos - 1] === "/";

  while (i < len) {
    const ch = pattern[i];

    // Extglob: +(pat), *(pat), ?(pat), @(pat), !(pat)
    if ((ch === "+" || ch === "*" || ch === "?" || ch === "@" || ch === "!") &&
        i + 1 < len && pattern[i + 1] === "(") {
      const extType = ch;
      i += 2; // skip past '('
      // Collect content until matching ')', handling nesting
      let depth = 1;
      let content = "";
      while (i < len && depth > 0) {
        if (pattern[i] === "(") { depth++; content += pattern[i]; }
        else if (pattern[i] === ")") {
          depth--;
          if (depth > 0) content += pattern[i];
        }
        else if (pattern[i] === "\\") {
          content += pattern[i];
          i++;
          if (i < len) content += pattern[i];
        }
        else { content += pattern[i]; }
        i++;
      }
      // Split content by | at depth 0, convert each part recursively
      const parts = splitExtglobParts(content);
      const fragments = parts.map(part => {
        const partRegex = globToRegex(part, dot, false);
        return partRegex.source.slice(1, -1); // strip ^...$
      });
      const group = fragments.join("|");

      if (extType === "+") {
        result += `(?:${group})+`;
      } else if (extType === "*") {
        result += `(?:${group})*`;
      } else if (extType === "?") {
        result += `(?:${group})?`;
      } else if (extType === "@") {
        result += `(?:${group})`;
      } else if (extType === "!") {
        // !(pat) = match anything that doesn't match pat
        result += `(?!(?:${group})$)[^/]*`;
      }
      continue;
    }

    if (ch === "\\") {
      i++;
      if (i < len) {
        result += escapeRegex(pattern[i]);
        i++;
      }
    } else if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          if (dot) {
            result += "(?:.*\\/)?";
          } else {
            result += "(?:(?:(?!(?:\\/|^)\\.).)*\\/)?";
          }
          i += 3;
        } else {
          if (dot) {
            result += ".*";
          } else {
            result += "(?:(?!(?:\\/|^)\\.).)*";
          }
          i += 2;
        }
      } else {
        if (!dot && atSegStart(i)) {
          result += "(?!\\.)";
        }
        result += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      if (!dot && atSegStart(i)) {
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
        const altRegex = globToRegex(alt, dot, false);
        return altRegex.source.slice(1, -1);
      });
      result += `(?:${fragments.join("|")})`;
    } else {
      result += escapeRegex(ch);
      i++;
    }
  }

  result += "$";
  let flags = "";
  if (nocase) flags += "i";
  return new RegExp(result, flags);
}

/** Split extglob content by | at depth 0 */
function splitExtglobParts(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "|" && depth === 0) { parts.push(current); current = ""; }
    else { current += ch; }
  }
  parts.push(current);
  return parts;
}

function escapeRegex(ch: string): string {
  if (".+*?^${}()|[]\\/".includes(ch)) {
    return "\\" + ch;
  }
  return ch;
}
