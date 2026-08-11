import { logger } from "../utils/logger";

export interface CacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    /** 0–1; 0 when nothing has been requested yet. */
    hitRate: number;
}

/**
 * LRU cache of rendered formula nodes.
 *
 * Uses insertion-order semantics of `Map`: re-inserting on every hit moves the entry to the end, so
 * the first key returned by `keys()` is always the least recently used. Avoids a linked list.
 *
 * Stored nodes are **templates**. Callers always receive a deep clone, because a node handed to the
 * DOM belongs to the DOM — reusing it would silently empty the cache entry when the consumer is
 * detached.
 */
export class MathCache {
    private store = new Map<string, HTMLElement>();
    private hits = 0;
    private misses = 0;

    constructor(private maxSize: number) {}

    get(key: string): HTMLElement | null {
        const node = this.store.get(key);
        if (!node) {
            this.misses++;
            return null;
        }
        // refresh recency
        this.store.delete(key);
        this.store.set(key, node);
        this.hits++;
        return node.cloneNode(true) as HTMLElement;
    }

    set(key: string, node: HTMLElement): void {
        if (this.maxSize <= 0) return;
        if (this.store.has(key)) this.store.delete(key);
        this.store.set(key, node.cloneNode(true) as HTMLElement);
        while (this.store.size > this.maxSize) {
            const oldest = this.store.keys().next();
            if (oldest.done) break;
            this.store.delete(oldest.value);
        }
    }

    resize(maxSize: number): void {
        this.maxSize = Math.max(0, maxSize);
        while (this.store.size > this.maxSize) {
            const oldest = this.store.keys().next();
            if (oldest.done) break;
            this.store.delete(oldest.value);
        }
    }

    clear(): void {
        const had = this.store.size;
        this.store.clear();
        this.hits = 0;
        this.misses = 0;
        if (had) logger.debug(`cache cleared (${had} entries)`);
    }

    get stats(): CacheStats {
        const total = this.hits + this.misses;
        return {
            size: this.store.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total === 0 ? 0 : this.hits / total,
        };
    }
}
