import { asDirectoryBase } from "../utils/resourceUrl";
import type { FontSource } from "../settingsModel";

export interface FontBaseInput {
    fontSource: FontSource;
    /** Vault-relative cache directory, or null while no complete local cache exists. */
    localDir: string | null;
    /** The configured `fontURL`, used in CDN mode and as the fallback before a cache exists. */
    configuredUrl: string;
    /** The host's resource-path resolver, i.e. `vault.adapter.getResourcePath`. */
    resourcePath: (vaultPath: string) => string;
}

/**
 * The font base URL the interactive engine should use right now.
 *
 * Kept as a pure function so the local/remote decision — including the `?`/`#` normalization
 * that issue #2 was about — is covered by tests instead of living only inside the plugin class.
 */
export function resolveFontBase(input: FontBaseInput): string {
    if (input.fontSource === "local" && input.localDir) {
        return asDirectoryBase(input.resourcePath(input.localDir));
    }
    return input.configuredUrl;
}
