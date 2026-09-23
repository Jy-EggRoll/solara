/**
 * 全屏 (Fullscreen API)
 * 语义：用户手动进入/退出全屏；状态由 fullscreenchange 同步（含按 ESC 退出）。
 * 不支持的环境（如 iPhone Safari 对普通元素）按钮置灰降级，不抛错。
 * 键位：非输入状态下 F 切换（键位本身登记在 core/shortcuts）。
 */

import { registerShortcut } from "./shortcuts.js";

interface FullscreenDom {
    fullscreenBtn?: HTMLElement | null;
}

let domRef: FullscreenDom | null = null;
let supported = false;
let shortcutBound = false;
let changeListenerBound = false;

function buttons(): HTMLButtonElement[] {
    const list: HTMLButtonElement[] = [];
    const toolbarButton = domRef?.fullscreenBtn;
    if (toolbarButton instanceof HTMLButtonElement) list.push(toolbarButton);
    const setting = document.getElementById("fullscreenSettingToggle");
    if (setting instanceof HTMLButtonElement) list.push(setting);
    return list;
}

function isActive(): boolean {
    return !!document.fullscreenElement;
}

function render(): void {
    const on = isActive();
    const label = `全屏：${on ? "开" : "关"}`;
    for (const btn of buttons()) {
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
    }
    const settingText = document.getElementById("fullscreenSettingText");
    if (settingText) settingText.textContent = label;
}

function log(message: string): void {
    const line = `[全屏] ${message}`;
    console.log(line);
    if (typeof window !== "undefined" && typeof window.__solaraDebugLog === "function") {
        window.__solaraDebugLog(line);
    }
}

function isSupported(): boolean {
    return (
        typeof document !== "undefined" &&
        !!document.documentElement.requestFullscreen &&
        typeof document.exitFullscreen === "function" &&
        document.fullscreenEnabled !== false
    );
}

async function toggle(): Promise<void> {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen();
        }
    } catch (err) {
        log(`切换失败: ${err instanceof Error ? err.name : String(err)}`);
    }
}

function bindShortcut(): void {
    if (shortcutBound) return;
    shortcutBound = true;
    registerShortcut({
        key: "f",
        handler: () => {
            void toggle();
        },
    });
}

export function initFullscreen(dom: FullscreenDom | null): void {
    domRef = dom || domRef;
    if (!buttons().length) return;

    supported = isSupported();
    if (!supported) {
        for (const btn of buttons()) {
            btn.disabled = true;
            btn.classList.add("is-disabled");
            const tip = "当前环境不支持全屏（需桌面浏览器或 Android Chrome）";
            btn.setAttribute("aria-label", tip);
            btn.setAttribute("title", tip);
        }
        const settingText = document.getElementById("fullscreenSettingText");
        if (settingText) settingText.textContent = "全屏：不可用";
        log(
            `不可用：requestFullscreen=${!!document.documentElement.requestFullscreen}，fullscreenEnabled=${document.fullscreenEnabled}`,
        );
        return;
    }

    for (const btn of buttons()) {
        if (btn.dataset.fullscreenBound) continue;
        btn.dataset.fullscreenBound = "1";
        btn.addEventListener("click", toggle);
    }

    if (!changeListenerBound) {
        changeListenerBound = true;
        document.addEventListener("fullscreenchange", render);
        document.addEventListener("fullscreenerror", () => log("进入全屏失败"));
    }

    bindShortcut();
    render();
}
