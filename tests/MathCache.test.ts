import { describe, expect, it } from "vitest";
import { MathCache } from "../src/engine/MathCache";

interface FakeNode {
    value: string;
    cloneNode(deep: boolean): FakeNode;
}

function node(value: string): HTMLElement {
    return {
        value,
        cloneNode: () => node(value),
    } as unknown as HTMLElement;
}

describe("MathCache", () => {
    it("returns clones and tracks hit statistics", () => {
        const cache = new MathCache(2);
        const original = node("a");
        cache.set("a", original);
        const first = cache.get("a");
        const second = cache.get("a");
        expect(first).not.toBe(original);
        expect(second).not.toBe(first);
        expect(cache.stats).toMatchObject({ size: 1, hits: 2, misses: 0 });
    });

    it("evicts the least recently used entry", () => {
        const cache = new MathCache(2);
        cache.set("a", node("a"));
        cache.set("b", node("b"));
        cache.get("a");
        cache.set("c", node("c"));
        expect(cache.get("b")).toBeNull();
        expect(cache.get("a")).not.toBeNull();
        expect(cache.get("c")).not.toBeNull();
    });

    it("supports disabling and resizing", () => {
        const cache = new MathCache(1);
        cache.set("a", node("a"));
        cache.resize(0);
        cache.set("b", node("b"));
        expect(cache.stats.size).toBe(0);
    });
});
