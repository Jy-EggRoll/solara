/**
 * Solara 播放防息屏 (Wake Lock)
 * 语义：仅当「开关开启 且 正在播放 且 页面可见」时持有屏幕锁；暂停 / 关锁 / 切后台即释放。
 * 仅在安全上下文 (HTTPS 或 localhost) 生效；不支持时按钮置灰降级，不抛错。
 */

const STORAGE_KEY = "solara_wakelock";
let sentinel = null;
let enabled = false;
let domRef = null;

function isSupported() {
    return typeof navigator !== "undefined" && "wakeLock" in navigator &&
        typeof window !== "undefined" && window.isSecureContext === true;
}

function isPlaying() {
    const audio = domRef && domRef.audioPlayer;
    return !!audio && !audio.paused && !audio.ended;
}

function render() {
    const btn = domRef && domRef.wakeLockBtn;
    if (!btn) return;
    btn.classList.toggle("is-active", enabled);
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    const label = enabled ? "关闭播放防息屏" : "开启播放防息屏";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
}

async function release() {
    if (!sentinel) return;
    try {
        await sentinel.release();
    } catch (_) { /* 已被浏览器释放，忽略 */ }
    sentinel = null;
}

async function acquire() {
    if (!enabled || !isSupported()) return;
    if (typeof document === "undefined" || document.hidden || !isPlaying()) return;
    try {
        await release();
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => { sentinel = null; }, { once: true });
    } catch (_) {
        sentinel = null;
    }
}

async function refresh() {
    if (enabled && !document.hidden && isPlaying()) {
        await acquire();
    } else {
        await release();
    }
}

export function initWakeLock(dom, state) {
    domRef = dom || domRef;
    const btn = domRef && domRef.wakeLockBtn;
    if (!btn) return;

    if (!isSupported()) {
        btn.disabled = true;
        btn.classList.add("is-disabled");
        const tip = "当前环境不支持防息屏（需 HTTPS 或 localhost）";
        btn.setAttribute("aria-label", tip);
        btn.setAttribute("title", tip);
        return;
    }

    enabled = localStorage.getItem(STORAGE_KEY) === "1";
    if (state) state.wakeLockEnabled = enabled;
    render();

    if (!btn.__wakeLockBound) {
        btn.__wakeLockBound = true;
        btn.addEventListener("click", () => {
            enabled = !enabled;
            localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
            if (state) state.wakeLockEnabled = enabled;
            render();
            refresh();
        });
    }

    const audio = domRef && domRef.audioPlayer;
    if (audio && !audio.__wakeLockBound) {
        audio.__wakeLockBound = true;
        audio.addEventListener("play", () => { if (enabled) acquire(); });
        audio.addEventListener("pause", () => { release(); });
        audio.addEventListener("ended", () => { release(); });
    }

    if (!window.__wakeLockVisibilityBound) {
        window.__wakeLockVisibilityBound = true;
        document.addEventListener("visibilitychange", () => { refresh(); });
    }

    if (enabled) refresh();
}
