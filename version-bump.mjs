import { readFileSync, writeFileSync } from "fs";

/**
 * Runs from the `version` npm lifecycle script, i.e. `npm version x.y.z`.
 *
 * npm exports `npm_package_version` from package.json *after* it has already written the new
 * version, so running this file directly writes `undefined` into `versions.json` and drops the
 * `version` key from `manifest.json`. Guard against that.
 */
const targetVersion = process.env.npm_package_version;
if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
    console.error(
        "version-bump: npm_package_version is missing or not plain SemVer (x.y.z). " +
            "Run this through npm, e.g. `npm version 1.2.1`.",
    );
    process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.version !== targetVersion) {
    console.error(
        `version-bump: package.json is ${pkg.version} but npm reports ${targetVersion}; ` +
            "refusing to write an inconsistent manifest.",
    );
    process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
if (typeof minAppVersion !== "string" || !minAppVersion) {
    console.error("version-bump: manifest.json has no minAppVersion; refusing to bump.");
    process.exit(1);
}
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`manifest/versions bumped to ${targetVersion} (minAppVersion ${minAppVersion})`);
