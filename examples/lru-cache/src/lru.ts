// LRU cache with circular doubly-linked list and pre-allocated pool.
// Single sentinel node, Map pre-sized.

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V>;
  next: Node<K, V>;
}

export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, Node<K, V>>;
  private sentinel: Node<K, V>; // sentinel.next = MRU, sentinel.prev = LRU
  private freeHead: Node<K, V> | null;

  constructor(capacity: number) {
    this.capacity = capacity;
    // Pre-size hint: doesn't exist for Map, but let's create one
    this.map = new Map();

    // Single sentinel for circular list
    const sentinel = { key: undefined!, value: undefined!, prev: undefined!, next: undefined! } as Node<K, V>;
    sentinel.prev = sentinel;
    sentinel.next = sentinel;
    this.sentinel = sentinel;

    // Pre-allocate node pool
    let free: Node<K, V> | null = null;
    for (let i = 0; i < capacity; i++) {
      const node = { key: undefined!, value: undefined!, prev: undefined!, next: undefined! } as Node<K, V>;
      node.next = free!;
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
        node = this.freeHead!;
        this.freeHead = node.next as Node<K, V> | null;
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
