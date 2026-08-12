import type { MathJaxEngine } from "../engine/MathJaxEngine";

/**
 * Compatibility layer (plan §16).
 *
 * Central place that ties the engine to each Obsidian surface that renders math. Today only two
 * surfaces have working adapters — Reading View (`preview/MathPostProcessor`) and Live Preview
 * (`editor/LivePreviewRenderer`) — both registered directly on the plugin in `main.ts`. This manager
 * exists so that future surfaces (hover, canvas, popout, export) get a single, discoverable home and
 * share cross-cutting helpers such as per-document style injection.
 *
 * It deliberately owns no rendering logic itself; it is a registry + façade over the engine's
 * surface-agnostic helpers. Adapters stay the units of behaviour.
 */
export class CompatibilityManager {
    constructor(private readonly engine: MathJaxEngine) {}

    /** Mirror of {@link MathJaxEngine.ensureStyles} — see that method for the popout rationale. */
    ensureStyles(targetDoc: Document): void {
        this.engine.ensureStyles(targetDoc);
    }

    // Future adapters register here, e.g.:
    //   registerHoverPreview(adapter: HoverPreviewAdapter): void
    //   registerCanvas(adapter: CanvasAdapter): void
    // Each adapter then calls `ensureStyles`/`render` through this manager rather than touching the
    // engine directly, keeping the engine free of Obsidian-surface knowledge (plan risk 1).
}
