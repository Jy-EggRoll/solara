/**
 * 全屏 (Fullscreen API)
 * 语义：用户手动进入/退出全屏；状态由 fullscreenchange 同步（含按 ESC 退出）。
 * 不支持的环境（如 iPhone Safari 对普通元素）按钮置灰降级，不抛错。
 */

let domRef = null;
let supported = false;

function buttons() {
    const list = [];
    if (domRef && domRef.fullscreenBtn) list.push(domRef.fullscreenBtn);
    const setting = document.getElementById("fullscreenSettingToggle");
    if (setting) list.push(setting);
    return list;
}

function isActive() {
    return !!document.fullscreenElement;
}

function render() {
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

function log(message) {
    const line = `[全屏] ${message}`;
    console.log(line);
    if (typeof window !== "undefined" && typeof window.__solaraDebugLog === "function") {
        window.__solaraDebugLog(line);
    }
}

function isSupported() {
    return (
        typeof document !== "undefined" &&
        !!document.documentElement.requestFullscreen &&
        typeof document.exitFullscreen === "function" &&
        document.fullscreenEnabled !== false
    );
}

async function toggle() {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen();
        }
    } catch (err) {
        log(`切换失败: ${err && err.name ? err.name : err}`);
    }
}

export function initFullscreen(dom) {
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
        if (btn.__fullscreenBound) continue;
        btn.__fullscreenBound = true;
        btn.addEventListener("click", toggle);
    }

    if (!window.__fullscreenChangeBound) {
        window.__fullscreenChangeBound = true;
        document.addEventListener("fullscreenchange", render);
        document.addEventListener("fullscreenerror", () => log("进入全屏失败"));
    }

    render();
}
