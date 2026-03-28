// Correctness check — verifies encode/decode roundtrip.
// FROZEN — do not modify during autoresearch.

import { encode, decode } from "./src/codec.ts";
import { generateCorpus } from "./corpus.ts";

const corpus = generateCorpus();
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

// Roundtrip: decode(encoded) should match the expected decoded arrays
for (const tc of corpus) {
  const decoded = decode(tc.encoded);

  // Check line count
  assert(
    decoded.length === tc.decoded.length,
    `${tc.name}: line count ${decoded.length} !== ${tc.decoded.length}`,
  );

  // Check each segment
  let segmentMatch = true;
  for (let i = 0; i < Math.min(decoded.length, tc.decoded.length); i++) {
    const decodedLine = decoded[i];
    const expectedLine = tc.decoded[i];

    if (decodedLine.length !== expectedLine.length) {
      console.error(
        `FAIL: ${tc.name} line ${i}: segment count ${decodedLine.length} !== ${expectedLine.length}`,
      );
      segmentMatch = false;
      break;
    }

    for (let j = 0; j < decodedLine.length; j++) {
      const ds = decodedLine[j];
      const es = expectedLine[j];
      if (ds.length !== es.length || ds.some((v, k) => v !== es[k])) {
        console.error(
          `FAIL: ${tc.name} line ${i} seg ${j}: [${ds}] !== [${es}]`,
        );
        segmentMatch = false;
        break;
      }
    }
    if (!segmentMatch) break;
  }
  assert(segmentMatch, `${tc.name}: decode segments match`);
}

// Roundtrip: encode(decoded) should reproduce the original encoded string
for (const tc of corpus) {
  const reEncoded = encode(tc.decoded);
  assert(
    reEncoded === tc.encoded,
    `${tc.name}: encode roundtrip (got length ${reEncoded.length}, expected ${tc.encoded.length})`,
  );
}

// Roundtrip: decode(encode(decoded)) should match decoded
for (const tc of corpus) {
  const reEncoded = encode(tc.decoded);
  const reDecoded = decode(reEncoded);

  let match = reDecoded.length === tc.decoded.length;
  if (match) {
    for (let i = 0; i < reDecoded.length && match; i++) {
      if (reDecoded[i].length !== tc.decoded[i].length) {
        match = false;
        break;
      }
      for (let j = 0; j < reDecoded[i].length && match; j++) {
        const a = reDecoded[i][j];
        const b = tc.decoded[i][j];
        if (a.length !== b.length || a.some((v, k) => v !== b[k])) {
          match = false;
        }
      }
    }
  }
  assert(match, `${tc.name}: full roundtrip decode(encode(decoded))`);
}

// Edge cases
{
  // Empty mappings
  const empty = decode("");
  assert(empty.length === 1 && empty[0].length === 0, "empty string decodes to one empty line");
  assert(encode([[]]) === "", "encode one empty line produces empty string");

  // Single semicolons
  const twoLines = decode(";");
  assert(twoLines.length === 2, "semicolon produces two lines");
  assert(encode([[], []]) === ";", "encode two empty lines produces semicolon");

  // Simple known value
  const simple = decode("AAAA");
  assert(
    simple.length === 1 && simple[0].length === 1 &&
    simple[0][0][0] === 0 && simple[0][0][1] === 0 &&
    simple[0][0][2] === 0 && simple[0][0][3] === 0,
    "AAAA decodes to [0,0,0,0]",
  );
  assert(encode([[[0, 0, 0, 0]]]) === "AAAA", "encode [0,0,0,0] produces AAAA");

  // Negative values
  const neg = decode("DABD");
  assert(neg[0][0][0] === -1, "D decodes to -1 (generated column)");
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
