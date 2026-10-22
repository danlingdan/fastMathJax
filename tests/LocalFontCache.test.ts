import { describe, expect, it } from "vitest";
import {
    LocalFontCache,
    type FontCacheAdapter,
} from "../src/fonts/LocalFontCache";

/** Minimal woff2-shaped buffer: correct magic plus a few payload bytes. */
function woff2(): ArrayBuffer {
    return new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]).buffer;
}

function fakeAdapter(resourceSuffix = "") {
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
            return `app://cache/${path}${resourceSuffix}`;
        },
        async stat(path) {
            const value = files.get(path);
            if (value === undefined) return null;
            return {
                size: typeof value === "string"
                    ? new TextEncoder().encode(value).byteLength
                    : value.byteLength,
            };
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
        fontId: "newcm",
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
            resourceDir: "app://cache/.obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3",
            downloaded: 2,
        });
        const manifest = JSON.parse(
            state.files.get(
                ".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3/manifest.json",
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
        expect(result.resourceDir).toContain("fonts/newcm/4.1.3");
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
                ".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3/manifest.json",
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

    it("re-probes names a previous run recorded as unavailable", async () => {
        // A transient 404 (captive portal, jsDelivr rate limit) must not disable a face for the
        // lifetime of the cache; an explicit retry asks the source again.
        const state = fakeAdapter();
        const first = await makeCache(state, () => "not-found")
            .ensureFiles(["mjx-ncm-s.woff2"]);
        expect(first.ok).toBe(false);
        const path = ".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3/manifest.json";
        expect(JSON.parse(state.files.get(path) as string)).toEqual({});

        const second = await makeCache(state, () => woff2())
            .ensureFiles(["mjx-ncm-s.woff2"], { reprobeUnavailable: true });
        expect(second.ok).toBe(true);
        expect(second.downloaded).toBe(1);
        expect(JSON.parse(state.files.get(path) as string)["mjx-ncm-s.woff2"]).toBe(8);
    });

    it("fails instead of serving a directory with no glyph files", async () => {
        // Every name answering 404 used to return ok:true, pointing the engine at an empty
        // directory: every formula then rendered with fallback faces.
        const state = fakeAdapter();
        const result = await makeCache(state, () => "not-found")
            .ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("no font files available");
        expect(result.resourceDir).toBeNull();
    });

    it("cleans up font-version directories other than the current one", async () => {
        const state = fakeAdapter();
        await state.adapter.mkdir(".obsidian/plugins/latest-mathjax/fonts/newcm");
        await state.adapter.mkdir(".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.2");
        await state.adapter.mkdir(".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3");
        const cache = makeCache(state);
        await cache.cleanOtherVersions();
        const listing = await state.adapter
            .list(".obsidian/plugins/latest-mathjax/fonts/newcm");
        expect(listing.folders).toEqual([
            ".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3",
        ]);
    });

    it("returns a query-free base even when the host decorates resource URLs", async () => {
        // Obsidian may append a cache-busting query (and/or a fragment) to `app://` resource
        // URLs. The engine concatenates "/<file>.woff2" onto this base, so a suffix would
        // swallow the file name and every glyph request would fail (issue #2).
        for (const suffix of ["?1729076543210", "?v=1#frag", "#frag"]) {
            const state = fakeAdapter(suffix);
            const result = await makeCache(state).ensureFiles(["mjx-gdv-n.woff2"]);
            expect(result.ok).toBe(true);
            expect(result.resourceDir).toBe(
                "app://cache/.obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3",
            );
        }
    });

    it("shares one run between concurrent callers", async () => {
        const state = fakeAdapter();
        let fetches = 0;
        const cache = makeCache(state, () => {
            fetches++;
            return woff2();
        });
        const first = cache.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        const second = cache.ensureFiles(["mjx-ncm-s.woff2", "mjx-ncm-sb.woff2"]);
        const [a, b] = await Promise.all([first, second]);
        expect(fetches).toBe(2);
        expect(b).toBe(a);
        expect(a.ok).toBe(true);
    });

    it("re-downloads a cached file whose size no longer matches the manifest", async () => {
        // A truncated woff2 (interrupted write, synced placeholder) makes the browser drop the
        // whole face, which shows up as clipped math even though the URL is correct.
        const state = fakeAdapter();
        const cache = makeCache(state);
        await cache.ensureFiles(["mjx-ncm-s.woff2"]);
        const path = ".obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3/mjx-ncm-s.woff2";
        state.files.set(path, new Uint8Array([0x77, 0x4f]).buffer);

        let fetches = 0;
        const repaired = makeCache(state, () => {
            fetches++;
            return woff2();
        });
        const result = await repaired.ensureFiles(["mjx-ncm-s.woff2"]);
        expect(fetches).toBe(1);
        expect(result.ok).toBe(true);
        expect(result.downloaded).toBe(1);
        expect((state.files.get(path) as ArrayBuffer).byteLength).toBe(8);
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
