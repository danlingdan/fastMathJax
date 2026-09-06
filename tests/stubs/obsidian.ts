// Resolution stub for the real obsidian package, which ships types only and therefore has no
// entry vite can resolve. Tests that need runtime values vi.mock("obsidian") with a factory;
// the factory replaces this module's exports for those tests.
export const Component = class {
    load(): void {}
    unload(): void {}
};
export const MarkdownRenderer = {
    render: async (): Promise<unknown> => {},
};
export const Notice = class {};
export const TFile = class {};
export const TFolder = class {};
