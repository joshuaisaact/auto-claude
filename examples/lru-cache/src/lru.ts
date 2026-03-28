// LRU cache with circular doubly-linked list and pre-allocated pool.
// Nodes initialized with 0 (smi) to avoid undefined->number type transition.
// Sentinel-terminated free list (no null union type).

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V>;
  next: Node<K, V>;
}

export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, Node<K, V>>;
  private sentinel: Node<K, V>;
  private freeHead: Node<K, V>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();

    // Initialize sentinel with 0 values (smi) for consistent hidden class
    const sentinel = { key: 0 as any as K, value: 0 as any as V, prev: null! as Node<K, V>, next: null! as Node<K, V> };
    sentinel.prev = sentinel;
    sentinel.next = sentinel;
    this.sentinel = sentinel;

    // Pre-allocate pool — all nodes start with same shape (key:0, value:0, prev:node, next:node)
    let free: Node<K, V> = sentinel;
    for (let i = 0; i < capacity; i++) {
      const node: Node<K, V> = { key: 0 as any as K, value: 0 as any as V, prev: sentinel, next: free };
      free = node;
    }
    this.freeHead = free;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node === undefined) return undefined;
    // Remove from current position
    node.prev.next = node.next;
    node.next.prev = node.prev;
    // Insert after sentinel (MRU position)
    const s = this.sentinel;
    const sn = s.next;
    node.next = sn;
    node.prev = s;
    sn.prev = node;
    s.next = node;
    return node.value;
  }

  set(key: K, value: V): void {
    let node = this.map.get(key);
    if (node !== undefined) {
      node.value = value;
      // Move to front
      node.prev.next = node.next;
      node.next.prev = node.prev;
      const s = this.sentinel;
      const sn = s.next;
      node.next = sn;
      node.prev = s;
      sn.prev = node;
      s.next = node;
    } else {
      const s = this.sentinel;
      if (this.map.size >= this.capacity) {
        // Evict LRU (sentinel.prev)
        const lru = s.prev;
        lru.prev.next = s;
        s.prev = lru.prev;
        this.map.delete(lru.key);
        // Reuse node
        lru.key = key;
        lru.value = value;
        node = lru;
      } else {
        node = this.freeHead;
        this.freeHead = node.next;
        node.key = key;
        node.value = value;
      }
      // Insert after sentinel
      const sn = s.next;
      node.next = sn;
      node.prev = s;
      sn.prev = node;
      s.next = node;
      this.map.set(key, node);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (node === undefined) return false;
    // Remove from list
    node.prev.next = node.next;
    node.next.prev = node.prev;
    this.map.delete(key);
    // Return to free list
    node.key = 0 as unknown as K;
    node.value = 0 as unknown as V;
    node.next = this.freeHead;
    this.freeHead = node;
    return true;
  }

  peek(key: K): V | undefined {
    const node = this.map.get(key);
    return node === undefined ? undefined : node.value;
  }

  clear(): void {
    this.map.clear();
    const s = this.sentinel;
    // Rebuild free list from all nodes in the linked list
    let node = s.next;
    let free: Node<K, V> = s;
    while (node !== s) {
      const next = node.next;
      node.key = 0 as unknown as K;
      node.value = 0 as unknown as V;
      node.next = free;
      free = node;
      node = next;
    }
    s.prev = s;
    s.next = s;
    this.freeHead = free;
  }

  forEach(callback: (value: V, key: K, cache: this) => void): void {
    const s = this.sentinel;
    let node = s.next;
    while (node !== s) {
      callback(node.value, node.key, this);
      node = node.next;
    }
  }

  *keys(): IterableIterator<K> {
    const s = this.sentinel;
    let node = s.next;
    while (node !== s) {
      yield node.key;
      node = node.next;
    }
  }

  *values(): IterableIterator<V> {
    const s = this.sentinel;
    let node = s.next;
    while (node !== s) {
      yield node.value;
      node = node.next;
    }
  }

  *entries(): IterableIterator<[K, V]> {
    const s = this.sentinel;
    let node = s.next;
    while (node !== s) {
      yield [node.key, node.value];
      node = node.next;
    }
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  get size(): number {
    return this.map.size;
  }
}
