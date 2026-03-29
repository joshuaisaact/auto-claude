// Schema-based JSON serializer — optimized with code generation.
// This is the file the autoresearch agent edits.

export interface Schema {
  type: "object" | "array" | "string" | "integer" | "number" | "boolean" | "null";
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
}

export type Serializer = (obj: unknown) => string;

// Pre-build escape lookup table for chars 0-127
const ESCAPE_TABLE: string[] = new Array(128);
for (let i = 0; i < 32; i++) {
  ESCAPE_TABLE[i] = "\\u00" + (i < 16 ? "0" : "") + i.toString(16);
}
ESCAPE_TABLE[8] = "\\b";
ESCAPE_TABLE[9] = "\\t";
ESCAPE_TABLE[10] = "\\n";
ESCAPE_TABLE[12] = "\\f";
ESCAPE_TABLE[13] = "\\r";
ESCAPE_TABLE[34] = '\\"';
ESCAPE_TABLE[92] = "\\\\";

const NEEDS_ESCAPE = /[\x00-\x1f"\\]/;
const ESCAPE_RE_G = /[\x00-\x1f"\\]/g;

function serializeString(val: unknown): string {
  const str = val as string;
  if (!NEEDS_ESCAPE.test(str)) {
    return '"' + str + '"';
  }
  // Inline escape loop to avoid extra function call + string concat
  const re = ESCAPE_RE_G;
  re.lastIndex = 0;
  let result = '"';
  let last = 0;
  let match;
  while ((match = re.exec(str)) !== null) {
    const idx = match.index;
    if (idx > last) result += str.slice(last, idx);
    result += ESCAPE_TABLE[str.charCodeAt(idx)];
    last = idx + 1;
  }
  if (last < str.length) result += str.slice(last);
  return result + '"';
}

// escapeString returns the escaped string WITHOUT quotes.
// Uses regex.exec() to jump between escape positions (native C++ scan).
function escapeString(str: string): string {
  const re = ESCAPE_RE_G;
  re.lastIndex = 0;
  let result = '';
  let last = 0;
  let match;
  while ((match = re.exec(str)) !== null) {
    const idx = match.index;
    if (idx > last) result += str.slice(last, idx);
    result += ESCAPE_TABLE[str.charCodeAt(idx)];
    last = idx + 1;
  }
  if (last === 0) return str;
  if (last < str.length) result += str.slice(last);
  return result;
}

function serializeNumber(val: unknown): string {
  return "" + (val as number);
}

function serializeBoolean(val: unknown): string {
  return (val as boolean) ? "true" : "false";
}

export function compile(schema: Schema): Serializer {
  return buildSerializer(schema);
}

function buildSerializer(schema: Schema): Serializer {
  switch (schema.type) {
    case "string":
      return serializeString;
    case "integer":
    case "number":
      return serializeNumber;
    case "boolean":
      return serializeBoolean;
    case "null":
      return () => "null";
    case "array":
      return buildArraySerializer(schema);
    case "object":
      return buildObjectSerializerCodegen(schema);
    default:
      return (val: unknown) => JSON.stringify(val);
  }
}

function buildArraySerializer(schema: Schema): Serializer {
  if (!schema.items) return (v: unknown) => JSON.stringify(v);

  const itemType = schema.items.type;

  // Specialized array serializers for common item types
  if (itemType === "string") {
    // String arrays: escapeString already handles clean strings efficiently
    const fn = new Function("esc", `return function(val) {
      var arr = val;
      var len = arr.length;
      if (len === 0) return "[]";
      var r = '["' + esc(arr[0]) + '"';
      for (var i = 1; i < len; i++) {
        r += ',"' + esc(arr[i]) + '"';
      }
      return r + "]";
    };`)(escapeString);
    return fn;
  }

  if (itemType === "integer" || itemType === "number") {
    return new Function("", `return function(val) {
      var arr = val;
      var len = arr.length;
      if (len === 0) return "[]";
      var r = "[" + arr[0];
      for (var i = 1; i < len; i++) r += "," + arr[i];
      return r + "]";
    };`)();
  }

  if (itemType === "boolean") {
    return new Function("", `return function(val) {
      var arr = val;
      var len = arr.length;
      if (len === 0) return "[]";
      var r = "[" + (arr[0] ? "true" : "false");
      for (var i = 1; i < len; i++) r += "," + (arr[i] ? "true" : "false");
      return r + "]";
    };`)();
  }

  // Generic: use a compiled serializer
  const itemSerializer = buildSerializer(schema.items);
  const fn = new Function("ser", `return function(val) {
    var arr = val;
    var len = arr.length;
    if (len === 0) return "[]";
    var r = "[" + ser(arr[0]);
    for (var i = 1; i < len; i++) {
      r += "," + ser(arr[i]);
    }
    return r + "]";
  };`)(itemSerializer);
  return fn;
}

// Returns either an inline expression or null if a function call is needed
function getInlineExpr(schema: Schema, valueExpr: string): string | null {
  switch (schema.type) {
    case "integer":
    case "number":
      return valueExpr;
    case "boolean":
      return `(${valueExpr} ? "true" : "false")`;
    case "null":
      return `"null"`;
    default:
      return null;
  }
}

function buildObjectSerializerCodegen(schema: Schema): Serializer {
  const props = schema.properties ?? {};
  const keys = Object.keys(props);

  if (keys.length === 0) {
    return () => "{}";
  }

  // Collect serializers needed (only for types that can't be inlined)
  const childSerializers: Serializer[] = [];
  const paramNames: string[] = [];
  const serializerMap: Map<number, number> = new Map();

  // Add escapeString for string properties
  let hasStringProp = false;
  for (let i = 0; i < keys.length; i++) {
    if (props[keys[i]].type === "string") { hasStringProp = true; break; }
  }
  if (hasStringProp) {
    paramNames.push("$$esc");
    childSerializers.push(escapeString as unknown as Serializer);
  }

  for (let i = 0; i < keys.length; i++) {
    const t = props[keys[i]].type;
    // String, array, and object types that aren't inlined need a serializer
    if (t !== "string") {
      const inline = getInlineExpr(props[keys[i]], "v");
      if (inline === null) {
        const paramIdx = childSerializers.length;
        childSerializers.push(buildSerializer(props[keys[i]]));
        paramNames.push("s" + paramIdx);
        serializerMap.set(i, paramIdx);
      }
    }
  }

  // Helper to get the expression for a given key
  function makeExpr(keyIdx: number): { prefix: string; commaPrefix: string; expr: string } {
    const key = keys[keyIdx];
    const jsonKey = JSON.stringify(key);
    const isString = props[key].type === "string";

    if (isString) {
      return {
        prefix: jsonKey + ':"',
        commaPrefix: "," + jsonKey + ':"',
        expr: `$$esc(v) + '"'`,
      };
    } else {
      const pfx = jsonKey + ":";
      const inline = getInlineExpr(props[key], "v");
      const expr = inline !== null ? inline : `s${serializerMap.get(keyIdx)}(v)`;
      return { prefix: pfx, commaPrefix: "," + pfx, expr };
    }
  }

  // Generate fast path block: assign locals, check all non-null, return single expression
  // Merges adjacent string literals to reduce concat operations
  function genFastPath(): string {
    let assigns = '';
    let check = '';
    // Build as segments: {type: 'lit', val} or {type: 'expr', val}
    const segs: {type: string; val: string}[] = [];
    segs.push({type: 'lit', val: '{'});
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const localVar = `_${i}`;
      assigns += `var ${localVar} = obj[${JSON.stringify(key)}];\n`;
      check += (i > 0 ? ' && ' : '') + `${localVar} != null`;
      const e = makeExpr(i);
      const prefix = i === 0 ? e.prefix : e.commaPrefix;
      if (props[key].type === "string") {
        segs.push({type: 'lit', val: prefix});
        segs.push({type: 'expr', val: `$$esc(${localVar})`});
        segs.push({type: 'lit', val: '"'});
      } else {
        segs.push({type: 'lit', val: prefix});
        const inline = getInlineExpr(props[key], localVar);
        if (inline !== null) {
          segs.push({type: 'expr', val: inline});
        } else {
          segs.push({type: 'expr', val: `s${serializerMap.get(i)}(${localVar})`});
        }
      }
    }
    segs.push({type: 'lit', val: '}'});

    // Merge adjacent lit segments
    const merged: {type: string; val: string}[] = [];
    for (const seg of segs) {
      if (seg.type === 'lit' && merged.length > 0 && merged[merged.length - 1].type === 'lit') {
        merged[merged.length - 1].val += seg.val;
      } else {
        merged.push({...seg});
      }
    }

    // Build expression
    let expr = '';
    for (let i = 0; i < merged.length; i++) {
      const seg = merged[i];
      if (i > 0) expr += ' + ';
      if (seg.type === 'lit') {
        expr += `'${seg.val}'`;
      } else {
        expr += seg.val;
      }
    }

    return `${assigns}if (${check}) return ${expr};\n`;
  }

  let code = "return function(obj) {\nvar v;\n";

  if (keys.length === 1) {
    const first = makeExpr(0);
    code += `v = obj[${JSON.stringify(keys[0])}];\n`;
    code += `if (v != null) return '{' + '${first.prefix}' + ${first.expr} + '}';\n`;
    code += `return '{}';\n`;
  } else {
    // Speculative fast path: all properties are defined (common case)
    code += genFastPath();

    // Fallback: property-by-property with null checks
    const first = makeExpr(0);
    code += `v = obj[${JSON.stringify(keys[0])}];\n`;
    code += `var r;\n`;
    code += `if (v != null) r = '{${first.prefix}' + ${first.expr};\n`;
    code += `else r = '{';\n`;

    for (let i = 1; i < keys.length; i++) {
      const e = makeExpr(i);
      code += `v = obj[${JSON.stringify(keys[i])}];\n`;
      code += `if (v != null) r += (r.length === 1 ? '${e.prefix}' : '${e.commaPrefix}') + ${e.expr};\n`;
    }
    code += `return r + '}';\n`;
  }

  code += "};";

  const fn = new Function(...paramNames, code)(...childSerializers);
  return fn;
}
