/**
 * LRU (Least Recently Used) 缓存实现
 * 当缓存达到容量限制时，自动删除最久未使用的项
 */

interface CacheNode<K, V> {
	key: K;
	value: V;
	prev: CacheNode<K, V> | null;
	next: CacheNode<K, V> | null;
}

export class LRUCache<K, V> {
	private capacity: number;
	private cache: Map<K, CacheNode<K, V>>;
	private head: CacheNode<K, V> | null;
	private tail: CacheNode<K, V> | null;
	private size: number;

	constructor(capacity: number) {
		this.capacity = capacity;
		this.cache = new Map();
		this.head = null;
		this.tail = null;
		this.size = 0;
	}

	/**
	 * 获取缓存值
	 * @param key 键
	 * @returns 值，如果不存在返回undefined
	 */
	get(key: K): V | undefined {
		const node = this.cache.get(key);
		if (!node) {
			return undefined;
		}

		// 将访问的节点移到链表头部（最近使用）
		this.moveToHead(node);
		return node.value;
	}

	/**
	 * 设置缓存值
	 * @param key 键
	 * @param value 值
	 */
	set(key: K, value: V): void {
		const existingNode = this.cache.get(key);

		if (existingNode) {
			// 更新现有节点
			existingNode.value = value;
			this.moveToHead(existingNode);
		} else {
			// 创建新节点
			const newNode: CacheNode<K, V> = {
				key,
				value,
				prev: null,
				next: null
			};

			this.cache.set(key, newNode);
			this.addToHead(newNode);
			this.size++;

			// 如果超过容量，删除最久未使用的节点（尾部）
			if (this.size > this.capacity) {
				this.removeTail();
			}
		}
	}

	/**
	 * 检查键是否存在
	 * @param key 键
	 * @returns 是否存在
	 */
	has(key: K): boolean {
		return this.cache.has(key);
	}

	/**
	 * 删除指定键
	 * @param key 键
	 * @returns 是否删除成功
	 */
	delete(key: K): boolean {
		const node = this.cache.get(key);
		if (!node) {
			return false;
		}

		this.removeNode(node);
		this.cache.delete(key);
		this.size--;
		return true;
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		this.cache.clear();
		this.head = null;
		this.tail = null;
		this.size = 0;
	}

	/**
	 * 获取当前缓存大小
	 * @returns 缓存项数量
	 */
	getSize(): number {
		return this.size;
	}

	/**
	 * 获取缓存容量
	 * @returns 最大容量
	 */
	getCapacity(): number {
		return this.capacity;
	}

	/**
	 * 获取所有键
	 * @returns 键数组
	 */
	keys(): K[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * 获取所有值
	 * @returns 值数组
	 */
	values(): V[] {
		return Array.from(this.cache.values()).map(node => node.value);
	}

	/**
	 * 遍历缓存（从最近使用到最久未使用）
	 * @param callback 回调函数
	 */
	forEach(callback: (value: V, key: K) => void): void {
		let current = this.head;
		while (current) {
			callback(current.value, current.key);
			current = current.next;
		}
	}

	/**
	 * 将节点移到链表头部
	 * @param node 节点
	 */
	private moveToHead(node: CacheNode<K, V>): void {
		if (node === this.head) {
			return;
		}

		this.removeNode(node);
		this.addToHead(node);
	}

	/**
	 * 添加节点到链表头部
	 * @param node 节点
	 */
	private addToHead(node: CacheNode<K, V>): void {
		node.prev = null;
		node.next = this.head;

		if (this.head) {
			this.head.prev = node;
		}

		this.head = node;

		if (!this.tail) {
			this.tail = node;
		}
	}

	/**
	 * 从链表中移除节点
	 * @param node 节点
	 */
	private removeNode(node: CacheNode<K, V>): void {
		if (node.prev) {
			node.prev.next = node.next;
		} else {
			this.head = node.next;
		}

		if (node.next) {
			node.next.prev = node.prev;
		} else {
			this.tail = node.prev;
		}
	}

	/**
	 * 删除尾部节点（最久未使用）
	 */
	private removeTail(): void {
		if (!this.tail) {
			return;
		}

		const tailNode = this.tail;
		this.cache.delete(tailNode.key);
		this.removeNode(tailNode);
		this.size--;
	}

	/**
	 * 获取缓存使用率
	 * @returns 0-1之间的数字
	 */
	getUsageRate(): number {
		return this.size / this.capacity;
	}

	/**
	 * 调整缓存容量
	 * @param newCapacity 新容量
	 */
	resize(newCapacity: number): void {
		if (newCapacity < 1) {
			throw new Error('Capacity must be at least 1');
		}

		this.capacity = newCapacity;

		// 如果新容量小于当前大小，删除多余的项
		while (this.size > this.capacity) {
			this.removeTail();
		}
	}

	/**
	 * 获取缓存统计信息
	 * @returns 统计对象
	 */
	getStats() {
		return {
			size: this.size,
			capacity: this.capacity,
			usageRate: this.getUsageRate(),
			isFull: this.size >= this.capacity
		};
	}
}
