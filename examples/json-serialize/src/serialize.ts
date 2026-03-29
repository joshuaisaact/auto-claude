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

  // Generate a codegen array serializer
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

function buildObjectSerializerCodegen(schema: Schema): Serializer {
  const props = schema.properties ?? {};
  const keys = Object.keys(props);

  if (keys.length === 0) {
    return () => "{}";
  }

  // Build child serializers and pass them as individual arguments
  const childSerializers: Serializer[] = [];
  const paramNames: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    childSerializers.push(buildSerializer(props[keys[i]]));
    paramNames.push("s" + i);
  }

  let code = "return function(obj) {\nvar r = '{';\nvar first = true;\nvar v;\n";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const jsonKey = JSON.stringify(key);
    const prefix = jsonKey + ":";
    const commaPrefix = "," + prefix;

    code += `v = obj[${jsonKey}];\n`;
    code += `if (v !== undefined) {\n`;
    code += `  if (first) { r += '${prefix}' + s${i}(v); first = false; }\n`;
    code += `  else { r += '${commaPrefix}' + s${i}(v); }\n`;
    code += `}\n`;
  }

  code += "return r + '}';\n};";

  const fn = new Function(...paramNames, code)(...childSerializers);
  return fn;
}
