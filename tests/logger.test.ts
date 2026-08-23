import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/utils/logger";

describe("logger", () => {
    afterEach(() => {
        logger.setEnabled(false);
        vi.restoreAllMocks();
    });

    it("keeps debug diagnostics off the normal console log channel", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        logger.setEnabled(true);

        logger.debug("rendered");

        expect(debug).toHaveBeenCalledWith("[MathJax4]", "rendered");
        expect(log).not.toHaveBeenCalled();
    });
});
