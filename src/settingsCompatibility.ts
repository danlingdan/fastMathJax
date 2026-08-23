export type ModernSettingTabMethod = "update" | "refreshDomState";

/**
 * Invokes an Obsidian 1.13 settings refresh method only when the running app provides it.
 *
 * The plugin still supports Obsidian 1.8-1.12 through PluginSettingTab.display(), so these newer
 * methods must not be referenced directly on SettingTab. Declarative settings are only rendered
 * by 1.13+, and this capability check keeps their refresh path isolated from the legacy runtime.
 */
export function invokeModernSettingTabMethod(
    target: object,
    methodName: ModernSettingTabMethod,
): boolean {
    const method = Reflect.get(target, methodName);
    if (typeof method !== "function") return false;
    Reflect.apply(method, target, []);
    return true;
}
