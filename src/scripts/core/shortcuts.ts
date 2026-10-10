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

// 提示文字里的符号写法：macOS 用 ⌘ 这类符号，其它平台用 Ctrl 这类词
const MAC_MODIFIER_SYMBOLS: Record<ShortcutModifier, string> = { ctrl: "⌃", meta: "⌘", alt: "⌥", shift: "⇧" };
const OTHER_MODIFIER_LABELS: Record<ShortcutModifier, string> = {
    ctrl: "Ctrl",
    meta: "Win",
    alt: "Alt",
    shift: "Shift",
};
const KEY_LABELS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

export function isMacPlatform(): boolean {
    if (typeof navigator === "undefined") return false;
    return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
}

/**
 * 把键位组合格式化成用于按钮提示的文字。
 *
 * 为什么按平台分两套写法：界面上的提示要跟用户手上的键盘一致，
 * macOS 习惯写 ⌘A，其它平台写 Ctrl+A，同一套符号两边都用会让人认不出来。
 */
export function formatShortcutLabel(key: string, modifiers: ShortcutModifier[] = []): string {
    const mainKey = KEY_LABELS[key] ?? key.toUpperCase();
    if (isMacPlatform()) {
        return modifiers.map((modifier) => MAC_MODIFIER_SYMBOLS[modifier]).join("") + mainKey;
    }
    return [...modifiers.map((modifier) => OTHER_MODIFIER_LABELS[modifier]), mainKey].join("+");
}

/** 平台主修饰键写法的键位：macOS 是 ⌘，其它平台是 Ctrl，对应 `ctrlKey || metaKey` 这类判定。 */
export function formatPrimaryShortcut(key: string): string {
    return formatShortcutLabel(key, [isMacPlatform() ? "meta" : "ctrl"]);
}
