import { spawnSync } from "node:child_process";

/**
 * Fails when the committed font-pack manifest no longer matches what the generator produces.
 *
 * `fontPackManifest.generated.ts` is checked in because the plugin imports it, but nothing in the
 * normal test run compares it with its source: `npm test` regenerates the file first, so a stale
 * checksum or byte count would ship green. This runs *after* generation and asks git whether the
 * tree changed.
 */
const TRACKED = "src/fonts/fontPackManifest.generated.ts";

const diff = spawnSync("git", ["diff", "--quiet", "--", TRACKED], { stdio: "inherit" });
if (diff.error) {
    console.error(`verify-generated: could not run git (${diff.error.message})`);
    process.exit(1);
}
if (diff.status !== 0) {
    const stat = spawnSync("git", ["diff", "--stat", "--", TRACKED], { encoding: "utf8" });
    console.error(
        `verify-generated: ${TRACKED} does not match scripts/generate-font-packs.mjs.\n` +
            `${stat.stdout ?? ""}\n` +
            "The generator is deterministic, so this means the committed manifest is stale or the " +
            "generator changed. Commit the regenerated file (npm run font-packs:generate).",
    );
    process.exit(1);
}

const status = spawnSync("git", ["status", "--porcelain", "--", TRACKED], { encoding: "utf8" });
if (status.status === 0 && status.stdout.trim().startsWith("??")) {
    console.error(`verify-generated: ${TRACKED} is untracked; commit it.`);
    process.exit(1);
}

console.log(`verify-generated: ${TRACKED} matches the generator output.`);
