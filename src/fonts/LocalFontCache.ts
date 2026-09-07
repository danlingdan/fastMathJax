import { logger } from "../utils/logger";

/**
 * The slice of Obsidian's DataAdapter this service uses, kept structural so tests can supply an
 * in-memory adapter without importing the plugin runtime.
 */
export interface FontCacheAdapter {
    mkdir(normalizedPath: string): Promise<void>;
    exists(normalizedPath: string): Promise<boolean>;
    read(normalizedPath: string): Promise<string>;
    write(normalizedPath: string, data: string): Promise<void>;
    writeBinary(normalizedPath: string, data: ArrayBuffer): Promise<void>;
    getResourcePath(normalizedPath: string): string;
    list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
    remove(normalizedPath: string): Promise<void>;
}

export interface LocalFontCacheDeps {
    adapter: FontCacheAdapter;
    /** Vault-relative plugin directory, e.g. `.obsidian/plugins/latest-mathjax`. */
    pluginDir: string;
    /** Bundled font version; cache directories are keyed by it. */
    fontVersion: string;
    /** Pinned download source root — never taken from user input. */
    sourceRoot: string;
    fetchImpl?: typeof fetch;
}

export interface EnsureResult {
    ok: boolean;
    /** `app://` resource path of the version directory, when `ok`. */
    resourceDir: string | null;
    /** Files downloaded during this call (not files already present). */
    downloaded: number;
    error?: string;
}

const MANIFEST_NAME = "manifest.json";
/** First four bytes of every woff2 file; anything else is not a font we wrote. */
const WOFF2_MAGIC = 0x77_4f_46_32;
/**
 * Manifest marker for a name the pinned source does not ship at all (HTTP 404). MathJax
 * 4.1.3's NewCM stylesheet references a few variant faces (`dvb`, `dvi`, `dvbi`, `abb`,
 * `abbi`) whose woff2 files were never published; treating them as a hard failure would
 * disable the whole local cache for notes that merely *mention* those variants. Recorded
 * so later runs skip the pointless re-fetch; no file is written for them.
 */
const UNAVAILABLE = -1;

/**
 * On-disk cache of the CommonHTML woff2 glyph files, enabling offline use of the CHTML renderer.
 *
 * Design contract (`docs/offline-fonts.md`): files are fetched only from the pinned, version-keyed
 * source root — never from user input — integrity-checked by the `wOF2` magic, recorded in a
 * per-version `manifest.json`, and served back through Obsidian's resource protocol. Cache
 * directories are keyed by font version so an upgrade never mixes glyph data; superseded versions
 * are removed once the new one is complete.
 */
export class LocalFontCache {
    private readonly fetchImpl: typeof fetch;
    private disposed = false;

    constructor(private readonly deps: LocalFontCacheDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch.bind(globalThis);
    }

    /** Stops in-flight work; a partially written cache simply resumes on the next attempt. */
    dispose(): void {
        this.disposed = true;
    }

    versionDir(version = this.deps.fontVersion): string {
        return `${this.deps.pluginDir}/fonts/${version}`;
    }

    /**
     * Makes sure every named file exists in the current version's directory, downloading missing
     * ones from the pinned source. `fileNames` are basenames as referenced by the engine's
     * `@font-face` rules; the set is derived from the live stylesheet so it stays in sync with the
     * bundled font data. Partial progress is recorded per file and resumes.
     */
    async ensureFiles(fileNames: string[]): Promise<EnsureResult> {
        const dir = this.versionDir();
        const resourceDir = this.deps.adapter.getResourcePath(dir);
        try {
            await this.deps.adapter.mkdir(dir);
            const cached = await this.readManifest(dir);
            const missing = [...new Set(fileNames)].filter((name) => !(name in cached));
            let downloaded = 0;
            for (const name of missing) {
                if (this.disposed) {
                    return { ok: false, resourceDir: null, downloaded, error: "cancelled" };
                }
                const data = await this.fetchFile(name);
                if (data === "unavailable") {
                    // The pinned source does not ship this name; remember that so the cache
                    // stays usable. Nothing references the face's glyphs in practice, and the
                    // browser falls back exactly as it does in CDN mode.
                    cached[name] = UNAVAILABLE;
                    await this.writeManifest(dir, cached);
                    continue;
                }
                if (data === null) {
                    return {
                        ok: false,
                        resourceDir: null,
                        downloaded,
                        error: `download failed for ${name}`,
                    };
                }
                await this.deps.adapter.writeBinary(`${dir}/${name}`, data);
                cached[name] = data.byteLength;
                await this.writeManifest(dir, cached);
                downloaded++;
            }
            if (downloaded > 0) {
                logger.debug(`local font cache: downloaded ${downloaded} file(s) into ${dir}`);
            }
            return { ok: true, resourceDir, downloaded };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn("local font cache: ensure failed:", error);
            return { ok: false, resourceDir: null, downloaded: 0, error: message };
        }
    }

    /** Removes font-version directories other than the current one. Best effort. */
    async cleanOtherVersions(): Promise<void> {
        try {
            const root = `${this.deps.pluginDir}/fonts`;
            if (!(await this.deps.adapter.exists(root))) return;
            const listing = await this.deps.adapter.list(root);
            for (const folder of listing.folders) {
                const version = folder.split("/").pop();
                if (version && version !== this.deps.fontVersion) {
                    await this.deps.adapter.remove(folder);
                    logger.debug(`local font cache: removed old version ${version}`);
                }
            }
        } catch (error) {
            logger.debug("local font cache: cleanup skipped:", error);
        }
    }

    private async readManifest(dir: string): Promise<Record<string, number>> {
        const path = `${dir}/${MANIFEST_NAME}`;
        if (!(await this.deps.adapter.exists(path))) return {};
        try {
            return JSON.parse(await this.deps.adapter.read(path)) as Record<string, number>;
        } catch {
            return {};
        }
    }

    private async writeManifest(dir: string, manifest: Record<string, number>): Promise<void> {
        await this.deps.adapter.write(`${dir}/${MANIFEST_NAME}`, JSON.stringify(manifest));
    }

    /**
     * Fetches one file and validates it. Returns `"unavailable"` when the pinned source
     * answers 404 (the font package does not ship this name), `null` for transient failures,
     * and the bytes otherwise.
     */
    private async fetchFile(
        name: string,
    ): Promise<ArrayBuffer | "unavailable" | null> {
        try {
            const response = await this.fetchImpl(`${this.deps.sourceRoot}/${name}`);
            if (response.status === 404) return "unavailable";
            if (!response.ok) return null;
            const data = await response.arrayBuffer();
            if (data.byteLength <= 4) return null;
            const magic = new DataView(data).getUint32(0);
            if (magic !== WOFF2_MAGIC) return null;
            return data;
        } catch (error) {
            logger.debug(`local font cache: fetch ${name} failed:`, error);
            return null;
        }
    }
}
