// LRU cache with pre-allocated node pool and free list.
// Nodes are reused instead of being GC'd.

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V>;
  next: Node<K, V>;
}

export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, Node<K, V>>;
  private head: Node<K, V>; // sentinel
  private tail: Node<K, V>; // sentinel
  private freeHead: Node<K, V> | null;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();

    // Sentinel nodes
    const head = { key: undefined!, value: undefined!, prev: undefined!, next: undefined! } as Node<K, V>;
    const tail = { key: undefined!, value: undefined!, prev: undefined!, next: undefined! } as Node<K, V>;
    head.next = tail;
    head.prev = head;
    tail.prev = head;
    tail.next = tail;
    this.head = head;
    this.tail = tail;

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
    // Move to front
    const prev = node.prev;
    const next = node.next;
    prev.next = next;
    next.prev = prev;

    const headNext = this.head.next;
    node.next = headNext;
    node.prev = this.head;
    headNext.prev = node;
    this.head.next = node;
    return node.value;
  }

  set(key: K, value: V): void {
    let node = this.map.get(key);
    if (node !== undefined) {
      node.value = value;
      // Move to front
      const prev = node.prev;
      const next = node.next;
      prev.next = next;
      next.prev = prev;

      const headNext = this.head.next;
      node.next = headNext;
      node.prev = this.head;
      headNext.prev = node;
      this.head.next = node;
    } else {
      if (this.map.size >= this.capacity) {
        // Evict LRU and recycle the node
        const lru = this.tail.prev;
        lru.prev.next = this.tail;
        this.tail.prev = lru.prev;
        this.map.delete(lru.key);

        // Reuse evicted node
        lru.key = key;
        lru.value = value;
        node = lru;
      } else {
        // Get from free list
        node = this.freeHead!;
        this.freeHead = node.next as Node<K, V> | null;
        node.key = key;
        node.value = value;
      }

      const headNext = this.head.next;
      node.next = headNext;
      node.prev = this.head;
      headNext.prev = node;
      this.head.next = node;
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
