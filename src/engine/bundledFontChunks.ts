import { mathjax } from "@mathjax/src/js/mathjax.js";

// MathJax 4 fonts split uncommon glyph data into dynamic modules. Obsidian community plugins ship
// as one main.js, so every New CM chunk is imported into that bundle and the loader becomes a
// synchronous no-op; FontData then runs the setup callback registered by each module.
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/accents-b-i.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/accents.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/arabic.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/arrows.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/braille-d.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/braille.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/calligraphic.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/cherokee.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/cyrillic-ss.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/cyrillic.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/devanagari.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/double-struck.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/fraktur.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/greek-ss.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/greek.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/hebrew.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin-b.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin-bi.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin-i.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/marrows.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/math.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/monospace-ex.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/monospace-l.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/monospace.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/mshapes.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/phonetics-ss.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/phonetics.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/PUA.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-b.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-bi.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-ex.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-i.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-r.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/script.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/shapes.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/symbols-b-i.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/symbols.js";
import "@mathjax/mathjax-newcm-font/js/chtml/dynamic/variants.js";

import "@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/braille-d.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/braille.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/cherokee.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/devanagari.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics-ss.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/phonetics.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/PUA.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js";
import "@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js";

export function configureBundledFontLoading(): void {
    mathjax.asyncLoad = () => undefined;
    mathjax.asyncIsSynchronous = true;
}

interface DynamicFileState {
    promise: Promise<void> | null;
    failed: boolean;
}

interface DynamicFontClassState {
    dynamicFiles?: Record<string, DynamicFileState>;
    dynamicExtensions?: Map<string, { files: Record<string, DynamicFileState> }>;
}

/**
 * Makes bundled dynamic font setup replayable for a fresh output-jax instance.
 *
 * MathJax stores each dynamic file's load promise on the font class. Once one CHTML/SVG instance
 * consumes it, a later instance skips that file's setup callback and therefore misses glyph data
 * and CSS. Renderer hot-switching creates exactly that sequence, so clear only the load markers;
 * the statically bundled setup callbacks remain registered.
 */
export function resetBundledFontState(fontClass: unknown): void {
    const state = fontClass as DynamicFontClassState;
    const reset = (files?: Record<string, DynamicFileState>) => {
        for (const file of Object.values(files ?? {})) {
            file.promise = null;
            file.failed = false;
        }
    };
    reset(state.dynamicFiles);
    for (const extension of state.dynamicExtensions?.values() ?? []) {
        reset(extension.files);
    }
}
