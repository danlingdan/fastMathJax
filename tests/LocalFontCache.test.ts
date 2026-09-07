import { describe, expect, it } from "vitest";
import {
    LocalFontCache,
    type FontCacheAdapter,
} from "../src/fonts/LocalFontCache";

/** Minimal woff2-shaped buffer: correct magic plus a few payload bytes. */
function woff2(): ArrayBuffer {
    return new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]).buffer;
}

function fakeAdapter() {
    const files = new Map<string, ArrayBuffer | string>();
    const folders = new Set<string>();
    const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
    const adapter: FontCacheAdapter = {
        async mkdir(path) {
            folders.add(path);
        },
        async exists(path) {
            return files.has(path) || folders.has(path);
        },
        async read(path) {
            const value = files.get(path);
            return typeof value === "string" ? value : "";
        },
        async write(path, data) {
            files.set(path, data);
            folders.add(parentOf(path));
        },
        async writeBinary(path, data) {
            files.set(path, data);
            folders.add(parentOf(path));
        },
        getResourcePath(path) {
            return `app://cache/${path}`;
        },
        async list(root) {
            const nested = [...folders].filter((f) => f.startsWith(`${root}/`));
            const direct = new Set(nested.map((f) => f.slice(root.length + 1).split("/")[0]));
            const filesHere = [...files.keys()]
                .filter((f) => f.startsWith(`${root}/`))
                .map((f) => f.slice(root.length + 1).split("/")[0]);
            return {
                files: filesHere.map((n) => `${root}/${n}`),
                folders: [...direct].map((n) => `${root}/${n}`),
            };
        },
        async remove(path) {
            [...files.keys()].filter((f) => f.startsWith(`${path}/`))
                .forEach((f) => files.delete(f));
            [...folders].filter((f) => f === path || f.startsWith(`${path}/`))
                .forEach((f) => folders.delete(f));
        },
    };
    return { adapter, files, folders };
}

type FetchBehavior = (url: string) => ArrayBuffer | "http-error" | "not-found";

function fakeFetch(behavior: FetchBehavior): typeof fetch {
    return (async (url: string | URL) => {
        const body = behavior(String(url));
        if (body === "not-found") {
            return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
        }
        if (body === "http-error") {
            return { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
        }
        return { ok: true, status: 200, arrayBuffer: async () => body } as unknown as Response;
    }) as typeof fetch;
}

function makeCache(
    state: ReturnType<typeof fakeAdapter>,
    behavior: FetchBehavior = () => woff2(),
    fontVersion = "4.1.3",
): LocalFontCache {
    return new LocalFontCache({
        adapter: state.adapter,
        pluginDir: ".obsidian/plugins/latest-mathjax",
        fontVersion,
        sourceRoot: "https://cdn.example.com/woff2",
        fetchImpl: fakeFetch(behavior),
    });
}

describe("LocalFontCache", () => {
    it("downloads missing files, records them in the manifest and returns the resource dir", async () => {
        const state = fakeAdapter();
        const cache = makeCache(state);
        const result = await cache.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        expect(result).toMatchObject({
            ok: true,
            resourceDir: "app://cache/.obsidian/plugins/latest-mathjax/fonts/4.1.3",
            downloaded: 2,
        });
        const manifest = JSON.parse(
            state.files.get(
                ".obsidian/plugins/latest-mathjax/fonts/4.1.3/manifest.json",
            ) as string,
        ) as Record<string, number>;
        expect(Object.keys(manifest).sort()).toEqual(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        expect(manifest["mjx-ncm-s.woff2"]).toBe(8);
    });

    it("skips files already recorded in the manifest", async () => {
        const state = fakeAdapter();
        const cache = makeCache(state);
        await cache.ensureFiles(["mjx-ncm-s.woff2"]);
        let fetches = 0;
        const counting = makeCache(state, (url) => {
            fetches++;
            return woff2();
        });
        const result = await counting.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        expect(result.downloaded).toBe(1);
        expect(fetches).toBe(1);
        expect(result.resourceDir).toContain("fonts/4.1.3");
    });

    it("rejects non-woff2 responses and records nothing for them", async () => {
        const state = fakeAdapter();
        const cache = makeCache(state, () => new TextEncoder().encode("not a font").buffer);
        const result = await cache.ensureFiles(["mjx-ncm-s.woff2"]);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("mjx-ncm-s.woff2");
        expect([...state.files.keys()].filter((f) => f.endsWith(".woff2"))).toHaveLength(0);
    });

    it("treats an HTTP error as a failed download", async () => {
        const state = fakeAdapter();
        const cache = makeCache(state, () => "http-error");
        const result = await cache.ensureFiles(["mjx-ncm-s.woff2"]);
        expect(result.ok).toBe(false);
        expect(state.files.size).toBe(0);
    });

    it("marks names the pinned source does not ship (404) as unavailable and stays usable", async () => {
        // MathJax 4.1.3's NewCM stylesheet references a few variant woff2 files (dvb, dvi,
        // dvbi, abb, abbi) that the font package never shipped; a note merely mentioning
        // \mathbb pulls them in. They must not disable the whole local cache.
        const state = fakeAdapter();
        const cache = makeCache(state, (url) =>
            url.endsWith("mjx-ncm-dvb.woff2") ? "not-found" : woff2());
        const result = await cache.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-dvb.woff2"]);
        expect(result.ok).toBe(true);
        const manifest = JSON.parse(
            state.files.get(
                ".obsidian/plugins/latest-mathjax/fonts/4.1.3/manifest.json",
            ) as string,
        ) as Record<string, number>;
        expect(manifest["mjx-ncm-dvb.woff2"]).toBe(-1);
        expect(manifest["mjx-ncm-s.woff2"]).toBe(8);

        let fetches = 0;
        const again = makeCache(state, () => {
            fetches++;
            return woff2();
        });
        const second = await again.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-dvb.woff2"]);
        expect(second.ok).toBe(true);
        expect(fetches).toBe(0);
    });

    it("cleans up font-version directories other than the current one", async () => {
        const state = fakeAdapter();
        await state.adapter.mkdir(".obsidian/plugins/latest-mathjax/fonts");
        await state.adapter.mkdir(".obsidian/plugins/latest-mathjax/fonts/4.1.2");
        await state.adapter.mkdir(".obsidian/plugins/latest-mathjax/fonts/4.1.3");
        const cache = makeCache(state);
        await cache.cleanOtherVersions();
        const listing = await state.adapter
            .list(".obsidian/plugins/latest-mathjax/fonts");
        expect(listing.folders).toEqual([
            ".obsidian/plugins/latest-mathjax/fonts/4.1.3",
        ]);
    });

    it("stops downloading after dispose", async () => {
        const state = fakeAdapter();
        const cache = makeCache(state);
        cache.dispose();
        const result = await cache.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("cancelled");
    });
});
