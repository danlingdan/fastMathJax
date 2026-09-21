import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { FONT_PACK_MANIFEST } from "./fontPackManifest.generated";
import type { DownloadedFontPack } from "./PackedFont";

export type FontFamily = "newcm" | "stix2" | "fira";

export interface FontPackAdapter {
    mkdir(normalizedPath: string): Promise<void>;
    exists(normalizedPath: string): Promise<boolean>;
    readBinary(normalizedPath: string): Promise<ArrayBuffer>;
    writeBinary(normalizedPath: string, data: ArrayBuffer): Promise<void>;
    remove(normalizedPath: string): Promise<void>;
}

export interface FontPackManagerDeps {
    adapter: FontPackAdapter;
    pluginDir: string;
    pluginVersion: string;
    download: (url: string) => Promise<ArrayBuffer>;
    releaseBaseUrl?: string;
}

const RELEASE_BASE_URL = "https://github.com/danlingdan/fastMathJax/releases/download";
const manifest = new Map(FONT_PACK_MANIFEST.map((entry) => [entry.id, entry]));

export const FONT_FAMILIES = [
    { id: "newcm", name: "New Computer Modern", bundled: true },
    ...FONT_PACK_MANIFEST.map((entry) => ({ id: entry.id, name: entry.name, bundled: false })),
] as const;

export class FontPackManager {
    private readonly loaded = new Map<FontFamily, DownloadedFontPack>();
    private readonly pending = new Map<FontFamily, Promise<DownloadedFontPack>>();
    private disposed = false;

    constructor(private readonly deps: FontPackManagerDeps) {}

    dispose(): void {
        this.disposed = true;
        this.loaded.clear();
    }

    get(family: FontFamily): DownloadedFontPack | null {
        return this.loaded.get(family) ?? null;
    }

    async loadCached(family: FontFamily): Promise<DownloadedFontPack | null> {
        if (family === "newcm") return null;
        const entry = manifest.get(family);
        if (!entry) throw new Error(`unsupported font family: ${family}`);
        const path = this.packPath(entry.fileName);
        if (!(await this.deps.adapter.exists(path))) return null;
        try {
            const pack = this.decode(await this.deps.adapter.readBinary(path), family);
            this.loaded.set(family, pack);
            return pack;
        } catch (error) {
            await this.deps.adapter.remove(path).catch(() => undefined);
            throw error;
        }
    }

    ensure(family: FontFamily): Promise<DownloadedFontPack | null> {
        if (family === "newcm") return Promise.resolve(null);
        const loaded = this.loaded.get(family);
        if (loaded) return Promise.resolve(loaded);
        const current = this.pending.get(family);
        if (current) return current;
        const task = this.ensurePack(family).finally(() => this.pending.delete(family));
        this.pending.set(family, task);
        return task;
    }

    private async ensurePack(family: Exclude<FontFamily, "newcm">): Promise<DownloadedFontPack> {
        const cached = await this.loadCached(family).catch(() => null);
        if (cached) return cached;
        const entry = manifest.get(family);
        if (!entry) throw new Error(`unsupported font family: ${family}`);
        const base = this.deps.releaseBaseUrl ?? RELEASE_BASE_URL;
        const url = `${base}/${this.deps.pluginVersion}/${entry.fileName}`;
        const compressed = await this.deps.download(url);
        if (this.disposed) throw new Error("font pack download cancelled");
        const pack = this.decode(compressed, family);
        const directory = this.packDirectory();
        await this.deps.adapter.mkdir(directory);
        await this.deps.adapter.writeBinary(this.packPath(entry.fileName), compressed);
        if (this.disposed) throw new Error("font pack download cancelled");
        this.loaded.set(family, pack);
        return pack;
    }

    private decode(compressed: ArrayBuffer, family: Exclude<FontFamily, "newcm">): DownloadedFontPack {
        const entry = manifest.get(family);
        if (!entry) throw new Error(`unsupported font family: ${family}`);
        const bytes = new Uint8Array(compressed);
        if (bytes.byteLength !== entry.compressedBytes) {
            throw new Error(`font pack size mismatch for ${family}`);
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== entry.sha256) throw new Error(`font pack checksum mismatch for ${family}`);
        const unpacked = gunzipSync(bytes);
        if (unpacked.byteLength !== entry.uncompressedBytes) {
            throw new Error(`font pack expanded size mismatch for ${family}`);
        }
        const parsed = JSON.parse(unpacked.toString("utf8")) as Partial<DownloadedFontPack>;
        if (
            parsed.schemaVersion !== 1 ||
            parsed.id !== family ||
            parsed.fontVersion !== entry.fontVersion ||
            !parsed.chtml ||
            !parsed.svg
        ) {
            throw new Error(`invalid font pack metadata for ${family}`);
        }
        return parsed as DownloadedFontPack;
    }

    private packDirectory(): string {
        return `${this.deps.pluginDir}/font-packs`;
    }

    private packPath(fileName: string): string {
        return `${this.packDirectory()}/${fileName}`;
    }
}
