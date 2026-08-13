/**
 * Shared policy for deciding whether a supported surface may render in a document.
 * A popout is detected by document identity instead of relying on Obsidian internals.
 */
export class CompatibilityManager {
    constructor(private readonly hostDocument: Document) {}

    isPopout(targetDoc: Document): boolean {
        return targetDoc !== this.hostDocument;
    }

    canRender(targetDoc: Document, popoutEnabled: boolean): boolean {
        return !this.isPopout(targetDoc) || popoutEnabled;
    }
}
