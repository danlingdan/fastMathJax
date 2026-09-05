import {
    normalizePreamblePath,
    preambleFileSource,
    type PreambleProblem,
} from "./preambleModel";

/** Default settle time for vault edit bursts before the preamble file is re-read. */
export const PREAMBLE_RELOAD_DEBOUNCE_MS = 400;

/**
 * Why a vault event was forwarded to the service. The plugin translates Obsidian events;
 * the service only needs the path.
 */
export type PreambleVaultEventKind = "create" | "modify" | "delete" | "rename";

/** Result of one load attempt, before it is applied to the plugin. */
export interface PreambleLoadResult {
    /** File content, empty when no file is configured or the read failed. */
    content: string;
    /** Visible problem for the configured path, if it could not be read. */
    problem: PreambleProblem | null;
    /** True when the loaded content differs from what the plugin already applied. */
    changed: boolean;
}

/**
 * Everything the service needs from the outside world. All Obsidian access stays in the plugin,
 * which keeps this class unit-testable without a vault.
 */
export interface PreambleFileServiceDeps {
    /** The raw, user-typed path from settings, re-read on every load. */
    getRawPath: () => string;
    /** Reads a normalized vault-relative path; throws on I/O failure. */
    readFile: (path: string) => Promise<string>;
    /** Classifies a normalized path without reading it. */
    statPath: (path: string) => "file" | "folder" | "missing";
    /**
     * Persists a load result into plugin state and the engine. Receives the new content and
     * problem; must return true only when the applied *content* changed (engine input changed).
     */
    applyResult: (content: string, problem: PreambleProblem | null) => boolean;
    /** Called after applyResult reported a content change; refreshes rendered surfaces. */
    onContentApplied: () => void;
    debounceMs?: number;
}

/**
 * Loads the configured preamble file and re-loads it after vault edits.
 *
 * Owns two responsibilities: turning a configured path into `{content, problem}` with precise
 * diagnostics (missing file vs. folder vs. unreadable), and collapsing vault edit bursts into a
 * single reload. It never renders and never touches Obsidian types.
 */
export class PreambleFileService {
    private readonly debounceMs: number;
    private reloadHandle: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    constructor(private readonly deps: PreambleFileServiceDeps) {
        this.debounceMs = deps.debounceMs ?? PREAMBLE_RELOAD_DEBOUNCE_MS;
    }

    /**
     * Loads the configured preamble file now.
     *
     * Never throws for an unreadable file — that becomes a problem diagnostic — but an unexpected
     * applyResult failure propagates to the caller.
     */
    async reload(): Promise<PreambleLoadResult> {
        const { content, problem } = await this.readConfiguredFile();
        const changed = this.deps.applyResult(content, problem);
        if (changed) this.deps.onContentApplied();
        return { content, problem, changed };
    }

    /**
     * Forwards a vault event; reloads (debounced) when the event's path is the configured one.
     *
     * Create/rename/delete of the configured file must trigger even though the engine currently
     * renders without it, and edits of unrelated files must not schedule anything.
     */
    handleVaultEvent(eventPath: string, _kind: PreambleVaultEventKind): void {
        const configured = normalizePreamblePath(this.deps.getRawPath());
        if (!configured) return;
        const normalized = normalizePreamblePath(eventPath);
        if (normalized !== configured) return;
        this.scheduleReload();
    }

    /** Collapses an edit burst into one reload, matching how editors write files in bursts. */
    scheduleReload(): void {
        if (this.disposed) return;
        if (this.reloadHandle !== null) clearTimeout(this.reloadHandle);
        this.reloadHandle = setTimeout(() => {
            this.reloadHandle = null;
            void this.reload().catch((err) => {
                // applyResult/onContentApplied failures only; read failures become diagnostics.
                console.error("[MathJax4] preamble reload failed:", err);
            });
        }, this.debounceMs);
    }

    /** Cancels a pending debounced reload. Vault listeners are cleaned up by the plugin. */
    dispose(): void {
        this.disposed = true;
        if (this.reloadHandle !== null) {
            clearTimeout(this.reloadHandle);
            this.reloadHandle = null;
        }
    }

    private async readConfiguredFile(): Promise<{
        content: string;
        problem: PreambleProblem | null;
    }> {
        const raw = this.deps.getRawPath();
        if (!raw.trim()) return { content: "", problem: null };

        const normalized = normalizePreamblePath(raw);
        if (normalized === null) {
            return {
                content: "",
                problem: {
                    source: preambleFileSource(raw.trim()),
                    message: "Absolute paths are not supported; use a vault-relative path.",
                },
            };
        }
        const source = preambleFileSource(normalized);

        const kind = this.deps.statPath(normalized);
        if (kind === "folder") {
            return { content: "", problem: { source, message: "Path is a folder, not a file." } };
        }
        if (kind === "missing") {
            return {
                content: "",
                problem: { source, message: "File not found in the vault." },
            };
        }
        try {
            return { content: await this.deps.readFile(normalized), problem: null };
        } catch (err) {
            return {
                content: "",
                problem: {
                    source,
                    message: `Could not be read: ${err instanceof Error ? err.message : String(err)}`,
                },
            };
        }
    }
}
