// Schema-based JSON serializer — optimized with lookup table + fast path for strings.
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
ESCAPE_TABLE[8] = "\\b";   // backspace
ESCAPE_TABLE[9] = "\\t";   // tab
ESCAPE_TABLE[10] = "\\n";  // newline
ESCAPE_TABLE[12] = "\\f";  // form feed
ESCAPE_TABLE[13] = "\\r";  // carriage return
ESCAPE_TABLE[34] = '\\"';  // double quote
ESCAPE_TABLE[92] = "\\\\"; // backslash
// All other entries remain undefined (no escaping needed)

// Regex to detect if a string needs escaping at all
const NEEDS_ESCAPE = /[\x00-\x1f"\\]/;

function serializeString(val: unknown): string {
  const str = val as string;
  // Fast path: most strings don't need escaping
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
      return buildObjectSerializer(schema);
    default:
      return (val: unknown) => JSON.stringify(val);
  }
}

function serializeNumber(val: unknown): string {
  return "" + (val as number);
}

function serializeBoolean(val: unknown): string {
  return (val as boolean) ? "true" : "false";
}

function buildArraySerializer(schema: Schema): Serializer {
  const itemSerializer = schema.items ? buildSerializer(schema.items) : (v: unknown) => JSON.stringify(v);

  return (val: unknown) => {
    const arr = val as unknown[];
    if (arr.length === 0) return "[]";

    let result = "[" + itemSerializer(arr[0]);
    for (let i = 1; i < arr.length; i++) {
      result += "," + itemSerializer(arr[i]);
    }
    return result + "]";
  };
}

function buildObjectSerializer(schema: Schema): Serializer {
  const props = schema.properties ?? {};
  const keys = Object.keys(props);

  // Pre-build serializers for each property
  const propSerializers: Array<{ key: string; prefix: string; serializer: Serializer }> = [];
  for (const key of keys) {
    propSerializers.push({
      key,
      prefix: '"' + key + '":',
      serializer: buildSerializer(props[key]),
    });
  }

  return (val: unknown) => {
    const obj = val as Record<string, unknown>;
    let result = "{";
    let first = true;

    for (let i = 0; i < propSerializers.length; i++) {
      const { key, prefix, serializer } = propSerializers[i];
      const value = obj[key];
      if (value === undefined) continue;

      if (!first) result += ",";
      result += prefix + serializer(value);
      first = false;
    }

    return result + "}";
  };
}
