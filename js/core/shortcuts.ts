/**
 * 全局快捷键注册表：所有键位统一在此登记，由一个 keydown 监听集中派发。
 *
 * 约定：
 *  - 主键比较忽略大小写；修饰键必须「完全一致」才匹配（多按一个也不触发），
 *    因此登记 "f" 不会抢占浏览器的 Cmd/Ctrl+F。
 *  - 默认在输入状态下（input / textarea / select / contenteditable）不触发。
 *  - 默认阻止默认行为，长按不重复触发。
 *  - 同一主键按登记顺序先到先得，命中即止。
 */

export type ShortcutModifier = "ctrl" | "meta" | "alt" | "shift";

export interface Shortcut {
    /** 主键，如 "f"、"ArrowLeft"、"?"；比较时忽略大小写 */
    key: string;
    /** 需要同时按住的修饰键；不声明即要求「一个都不按」 */
    modifiers?: ShortcutModifier[];
    /** 是否允许在输入框 / 可编辑区域内触发，默认 false */
    allowInInput?: boolean;
    /** 是否阻止默认行为，默认 true */
    preventDefault?: boolean;
    /** 命中后的回调 */
    handler: (event: KeyboardEvent) => void;
}

const registry: Shortcut[] = [];
let listening = false;

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || !element.tagName) return false;
    if (element.isContentEditable) return true;
    return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT";
}

function modifiersMatch(event: KeyboardEvent, modifiers: ShortcutModifier[]): boolean {
    return (
        event.ctrlKey === modifiers.includes("ctrl") &&
        event.metaKey === modifiers.includes("meta") &&
        event.altKey === modifiers.includes("alt") &&
        event.shiftKey === modifiers.includes("shift")
    );
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) return;

    for (const shortcut of registry) {
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
        if (!modifiersMatch(event, shortcut.modifiers ?? [])) continue;
        if (!shortcut.allowInInput && (isTypingTarget(event.target) || isTypingTarget(document.activeElement))) return;

        if (shortcut.preventDefault !== false) event.preventDefault();
        shortcut.handler(event);
        return;
    }
}

/** 登记一个快捷键，返回注销函数（便于按上下文临时回收键位）。 */
export function registerShortcut(shortcut: Shortcut): () => void {
    registry.push(shortcut);

    if (!listening) {
        listening = true;
        window.addEventListener("keydown", handleKeydown);
    }

    return () => {
        const index = registry.indexOf(shortcut);
        if (index >= 0) registry.splice(index, 1);
    };
}
