/**
 * Normalizes a resource URL so it can be used as a **directory base**.
 *
 * Obsidian's `DataAdapter.getResourcePath()` is free to return a URL that carries a
 * cache-busting query (`app://<host>/<vault path>?<mtime>`) or a fragment. MathJax builds
 * every `@font-face` source by plain string concatenation
 * (`%%URL%%/<file>.woff2`, see `ChtmlFontData.addFontURLs`), so a `?` or `#` left in the
 * base pushes the file name into the query: the request never reaches the file, the faces
 * fail to load, and the renderer draws fallback glyphs at the selected font's metrics —
 * which shows up as clipped (partially cut-off) equations.
 *
 * Only the base is affected: paths handed to the adapter stay vault-relative.
 */
export function asDirectoryBase(resourceUrl: string): string {
    const cut = resourceUrl.search(/[?#]/);
    return cut === -1 ? resourceUrl : resourceUrl.slice(0, cut);
}

/**
 * The font file name at the end of a `@font-face` URL.
 *
 * Used to turn the engine's stylesheet URLs back into the basenames the cache stores. The query
 * and fragment are dropped first, otherwise a CDN URL such as `…/x.woff2?v=2` would yield a
 * "file name" that no source serves, and the cache would record a download failure for a face
 * that is perfectly available.
 */
export function fontFileName(url: string): string {
    const path = asDirectoryBase(url);
    const name = path.slice(path.lastIndexOf("/") + 1);
    return name.length > 0 ? name : url;
}
