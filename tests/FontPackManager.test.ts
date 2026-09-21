import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { FontPackManager } from "../src/fonts/FontPackManager";

const STIX_PACK = readFileSync("font-packs/mathjax-font-stix2-4.1.3.json.gz");

function arrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

function fakeAdapter(initial = new Map<string, ArrayBuffer>()) {
    const files = initial;
    return {
        files,
        adapter: {
            mkdir: vi.fn(async () => undefined),
            exists: vi.fn(async (path: string) => files.has(path)),
            readBinary: vi.fn(async (path: string) => files.get(path) as ArrayBuffer),
            writeBinary: vi.fn(async (path: string, data: ArrayBuffer) => {
                files.set(path, data);
            }),
            remove: vi.fn(async (path: string) => {
                files.delete(path);
            }),
        },
    };
}

describe("FontPackManager", () => {
    it("downloads, verifies, caches and reuses a non-executable font pack", async () => {
        const state = fakeAdapter();
        const download = vi.fn(async () => arrayBuffer(STIX_PACK));
        const manager = new FontPackManager({
            adapter: state.adapter,
            pluginDir: ".obsidian/plugins/latest-mathjax",
            pluginVersion: "1.1.0",
            releaseBaseUrl: "https://release.example",
            download,
        });

        const first = await manager.ensure("stix2");
        const second = await manager.ensure("stix2");
        expect(first).toMatchObject({ id: "stix2", name: "STIX Two", fontVersion: "4.1.3" });
        expect(second).toBe(first);
        expect(download).toHaveBeenCalledOnce();
        expect(download).toHaveBeenCalledWith(
            "https://release.example/1.1.0/mathjax-font-stix2-4.1.3.json.gz",
        );
        expect([...state.files.keys()]).toEqual([
            ".obsidian/plugins/latest-mathjax/font-packs/mathjax-font-stix2-4.1.3.json.gz",
        ]);
    });

    it("rejects and removes a corrupted cached pack", async () => {
        const path = ".obsidian/plugins/latest-mathjax/font-packs/" +
            "mathjax-font-stix2-4.1.3.json.gz";
        const state = fakeAdapter(new Map([[path, new Uint8Array([1, 2, 3]).buffer]]));
        const manager = new FontPackManager({
            adapter: state.adapter,
            pluginDir: ".obsidian/plugins/latest-mathjax",
            pluginVersion: "1.1.0",
            download: async () => arrayBuffer(STIX_PACK),
        });

        await expect(manager.loadCached("stix2")).rejects.toThrow("size mismatch");
        expect(state.files.has(path)).toBe(false);
    });
});
