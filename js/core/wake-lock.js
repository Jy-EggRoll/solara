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

function buttons() {
    const list = [];
    if (domRef && domRef.wakeLockBtn) list.push(domRef.wakeLockBtn);
    const setting = document.getElementById("wakeLockSettingToggle");
    if (setting) list.push(setting);
    return list;
}

function render() {
    const label = `防息屏：${enabled ? "开" : "关"}`;
    for (const btn of buttons()) {
        btn.classList.toggle("is-active", enabled);
        btn.setAttribute("aria-pressed", enabled ? "true" : "false");
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
    }
    const settingText = document.getElementById("wakeLockSettingText");
    if (settingText) settingText.textContent = label;
}

function log(message) {
    const line = `[防息屏] ${message}`;
    console.log(line);
    if (typeof window !== "undefined" && typeof window.__solaraDebugLog === "function") {
        window.__solaraDebugLog(line);
    }
}

async function release() {
    if (!sentinel) return;
    try {
        await sentinel.release();
        log("屏幕锁已释放");
    } catch (_) { /* 已被浏览器释放，忽略 */ }
    sentinel = null;
}

async function acquire() {
    if (!enabled || !isSupported()) return;
    if (typeof document === "undefined" || document.hidden || !isPlaying()) return;
    try {
        await release();
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => { sentinel = null; log("屏幕锁已被系统释放（切后台/锁屏）"); }, { once: true });
        log("屏幕锁已获取（播放中，屏幕不会熄灭）");
    } catch (err) {
        sentinel = null;
        log(`获取屏幕锁失败: ${err && err.name ? err.name : err}`);
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
    const settingBtn = document.getElementById("wakeLockSettingToggle");
    if (!btn && !settingBtn) return;

    if (!isSupported()) {
        for (const target of buttons()) {
            target.disabled = true;
            target.classList.add("is-disabled");
            const tip = "当前环境不支持防息屏（需 HTTPS 或 localhost）";
            target.setAttribute("aria-label", tip);
            target.setAttribute("title", tip);
        }
        const settingText = document.getElementById("wakeLockSettingText");
        if (settingText) settingText.textContent = "防息屏：不可用（需 HTTPS）";
        log(`不可用：Wake Lock 支持=${"wakeLock" in navigator}，安全上下文=${window.isSecureContext}`);
        return;
    }

    enabled = localStorage.getItem(STORAGE_KEY) === "1";
    if (state) state.wakeLockEnabled = enabled;
    render();
    log(`初始化完成：可用，当前开关=${enabled ? "开" : "关"}`);

    const toggle = () => {
        enabled = !enabled;
        localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        if (state) state.wakeLockEnabled = enabled;
        render();
        log(`开关切换为：${enabled ? "开" : "关"}`);
        refresh();
    };

    if (btn && !btn.__wakeLockBound) {
        btn.__wakeLockBound = true;
        btn.addEventListener("click", toggle);
    }
    if (settingBtn && !settingBtn.__wakeLockBound) {
        settingBtn.__wakeLockBound = true;
        settingBtn.addEventListener("click", toggle);
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
