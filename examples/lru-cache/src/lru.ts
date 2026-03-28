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

  get size(): number {
    return this.map.size;
  }
}
