// LRU cache with doubly-linked list + Map for O(1) get/set/evict.

interface Node<K, V> {
  key: K;
  value: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, Node<K, V>>;
  // Sentinel nodes eliminate null checks in list operations
  private head: Node<K, V>; // head.next = MRU
  private tail: Node<K, V>; // tail.prev = LRU

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();
    // Create sentinel nodes
    this.head = { key: undefined as K, value: undefined as V, prev: null, next: null };
    this.tail = { key: undefined as K, value: undefined as V, prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node === undefined) return undefined;
    // Move to front (most recent)
    this._remove(node);
    this._addToFront(node);
    return node.value;
  }

  set(key: K, value: V): void {
    let node = this.map.get(key);
    if (node !== undefined) {
      // Update existing
      node.value = value;
      this._remove(node);
      this._addToFront(node);
    } else {
      // New entry
      if (this.map.size >= this.capacity) {
        // Evict LRU (tail.prev)
        const lru = this.tail.prev!;
        this._remove(lru);
        this.map.delete(lru.key);
      }
      node = { key, value, prev: null, next: null };
      this._addToFront(node);
      this.map.set(key, node);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  private _remove(node: Node<K, V>): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private _addToFront(node: Node<K, V>): void {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next!.prev = node;
    this.head.next = node;
  }
}
