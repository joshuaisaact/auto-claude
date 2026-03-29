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

function serializeString(val: unknown): string {
  const str = val as string;
  if (!NEEDS_ESCAPE.test(str)) {
    return '"' + str + '"';
  }
  let result = '"';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const escape = code < 128 ? ESCAPE_TABLE[code] : undefined;
    if (escape !== undefined) {
      result += str.slice(last, i) + escape;
      last = i + 1;
    }
  }
  result += str.slice(last) + '"';
  return result;
}

// escapeString returns the escaped string WITHOUT quotes
function escapeString(str: string): string {
  if (!NEEDS_ESCAPE.test(str)) {
    return str;
  }
  let result = '';
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const escape = code < 128 ? ESCAPE_TABLE[code] : undefined;
    if (escape !== undefined) {
      result += str.slice(last, i) + escape;
      last = i + 1;
    }
  }
  return result + str.slice(last);
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
  const itemSerializer = schema.items ? buildSerializer(schema.items) : (v: unknown) => JSON.stringify(v);

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
      return `"" + ${valueExpr}`;
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

  // Add escapeString for string properties (quote-less escape)
  let hasStringProp = false;
  for (let i = 0; i < keys.length; i++) {
    if (props[keys[i]].type === "string") { hasStringProp = true; break; }
  }
  let escIdx = -1;
  let reIdx = -1;
  if (hasStringProp) {
    escIdx = childSerializers.length;
    paramNames.push("$$esc");
    childSerializers.push(escapeString as unknown as Serializer);
    reIdx = childSerializers.length;
    paramNames.push("$$re");
    childSerializers.push(NEEDS_ESCAPE as unknown as Serializer);
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

  let code = "return function(obj) {\nvar r = '{';\nvar first = true;\nvar v;\n";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const jsonKey = JSON.stringify(key);
    const isString = props[key].type === "string";

    // For string properties, merge the key prefix with the opening quote of the value
    // So instead of '"key":' + '"value"', we get '"key":"' + value + '"'
    let prefix: string;
    let commaPrefix: string;
    let expr: string;

    if (isString) {
      prefix = jsonKey + ':"';
      commaPrefix = "," + jsonKey + ':"';
      // Inline: if no escape needed, use raw string; else escape
      expr = `($$re.test(v) ? $$esc(v) : v) + '"'`;
    } else {
      prefix = jsonKey + ":";
      commaPrefix = "," + prefix;
      const inline = getInlineExpr(props[key], "v");
      expr = inline !== null ? inline : `s${serializerMap.get(i)}(v)`;
    }

    code += `v = obj[${jsonKey}];\n`;
    code += `if (v !== undefined) {\n`;
    code += `  if (first) { r += '${prefix}' + ${expr}; first = false; }\n`;
    code += `  else { r += '${commaPrefix}' + ${expr}; }\n`;
    code += `}\n`;
  }

  code += "return r + '}';\n};";

  const fn = new Function(...paramNames, code)(...childSerializers);
  return fn;
}
