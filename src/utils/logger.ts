const PREFIX = "[MathJax4]";

/**
 * Debug logging gated by a settings toggle.
 *
 * Deliberately a tiny mutable singleton rather than dependency-injected: it is called from deep
 * inside the render path (widgets, cache) where threading a logger through would add noise for no
 * benefit.
 */
class Logger {
    private enabled = false;

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    get isEnabled(): boolean {
        return this.enabled;
    }

    debug(...args: unknown[]): void {
        if (this.enabled) console.debug(PREFIX, ...args);
    }

    /** Warnings are always shown — they indicate real problems, not diagnostics. */
    warn(...args: unknown[]): void {
        console.warn(PREFIX, ...args);
    }

    error(...args: unknown[]): void {
        console.error(PREFIX, ...args);
    }

    /** Measures a synchronous block; the label is only formatted when debug is on. */
    time<T>(label: string, fn: () => T): T {
        if (!this.enabled) return fn();
        const start = performance.now();
        try {
            return fn();
        } finally {
            const ms = performance.now() - start;
            console.debug(PREFIX, `${label} took ${ms.toFixed(1)}ms`);
        }
    }
}

export const logger = new Logger();
