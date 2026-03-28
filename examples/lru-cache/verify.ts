// Correctness check — verifies the LRU cache behaves correctly.
// FROZEN — do not modify during autoresearch.

import { LRUCache } from "./src/lru.ts";

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

// Basic get/set
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert(c.get("a") === 1, "get existing key");
  assert(c.get("z") === undefined, "get missing key");
  assert(c.size === 3, "size after 3 inserts");
}

// Eviction of LRU
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.set("d", 4); // should evict "a"
  assert(c.get("a") === undefined, "evicted LRU key");
  assert(c.get("b") === 2, "non-evicted key survives");
  assert(c.get("d") === 4, "new key accessible");
  assert(c.size === 3, "size stays at capacity");
}

// Get refreshes recency
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.get("a"); // refresh "a", now "b" is LRU
  c.set("d", 4); // should evict "b", not "a"
  assert(c.get("a") === 1, "refreshed key not evicted");
  assert(c.get("b") === undefined, "LRU key evicted after refresh");
}

// Update existing key
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("a", 10); // update
  assert(c.get("a") === 10, "updated value");
  assert(c.size === 2, "update doesn't increase size");
}

// Update refreshes recency
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.set("a", 10); // update "a", now "b" is LRU
  c.set("d", 4); // should evict "b"
  assert(c.get("a") === 10, "updated key not evicted");
  assert(c.get("b") === undefined, "LRU key evicted after update");
}

// has() does not affect recency
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.has("a"); // should NOT refresh "a"
  c.set("d", 4); // should evict "a" (still LRU)
  assert(c.get("a") === undefined, "has() does not refresh recency");
}

// Capacity 1
{
  const c = new LRUCache<string, number>(1);
  c.set("a", 1);
  c.set("b", 2);
  assert(c.get("a") === undefined, "cap=1 evicts immediately");
  assert(c.get("b") === 2, "cap=1 keeps last");
  assert(c.size === 1, "cap=1 size");
}

// Numeric keys (matching benchmark workload types)
{
  const c = new LRUCache<number, number>(100);
  for (let i = 0; i < 200; i++) {
    c.set(i, i * 10);
  }
  assert(c.size === 100, "size capped at capacity with numeric keys");
  assert(c.get(0) === undefined, "early numeric keys evicted");
  assert(c.get(199) === 1990, "recent numeric key accessible");
}

// delete()
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert(c.delete("b") === true, "delete returns true for existing key");
  assert(c.get("b") === undefined, "deleted key is gone");
  assert(c.size === 2, "size decreases after delete");
  assert(c.delete("z") === false, "delete returns false for missing key");
}

// delete frees slot for new entries without eviction
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.delete("b");
  c.set("d", 4); // should NOT evict "a" — there's a free slot
  assert(c.get("a") === 1, "delete freed slot, no eviction needed");
  assert(c.get("d") === 4, "new key in freed slot");
}

// peek() does not affect recency
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert(c.peek("a") === 1, "peek returns value");
  assert(c.peek("z") === undefined, "peek returns undefined for missing");
  c.set("d", 4); // should evict "a" (peek didn't refresh it)
  assert(c.get("a") === undefined, "peek does not refresh recency");
}

// clear()
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.clear();
  assert(c.size === 0, "clear resets size");
  assert(c.get("a") === undefined, "clear removes all entries");
  c.set("x", 10);
  assert(c.get("x") === 10, "cache works after clear");
  assert(c.size === 1, "size correct after clear + set");
}

// forEach (MRU to LRU order)
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  const keys: string[] = [];
  c.forEach((v, k) => keys.push(k));
  assert(keys[0] === "c", "forEach first is MRU");
  assert(keys[2] === "a", "forEach last is LRU");
  assert(keys.length === 3, "forEach visits all entries");
}

// keys/values/entries iterators
{
  const c = new LRUCache<string, number>(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert([...c.keys()].join(",") === "c,b,a", "keys iterator MRU->LRU");
  assert([...c.values()].join(",") === "3,2,1", "values iterator MRU->LRU");
  const entries = [...c.entries()];
  assert(entries[0][0] === "c" && entries[0][1] === 3, "entries iterator");
}

// Symbol.iterator
{
  const c = new LRUCache<string, number>(2);
  c.set("x", 10);
  c.set("y", 20);
  const arr = [...c];
  assert(arr.length === 2, "Symbol.iterator works");
  assert(arr[0][0] === "y", "Symbol.iterator is MRU first");
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
