/**
 * 设备布局判定与视口 / 键盘适配。
 *
 * 布局模式由**媒体查询**决定，与样式层使用同一条件（见 README「目录与命名约定」）：
 * 移动端 = `(max-width: 820px), (hover: none), (pointer: coarse)`，
 * 桌面端 = `(min-width: 821px) and (hover: hover) and (pointer: fine)`。
 * 这里只在需要"行为差异"时查询它（是否加载手势层、是否启用键盘适配等），
 * 不再往 <html>/<body> 上派发设备类——样式不再依赖任何 JS 派发的类。
 */

/** 与样式层保持完全一致的条件；改这里必须同步改 CSS 里的两条媒体查询。 */
export const MOBILE_MEDIA_QUERY = "(max-width: 820px), (hover: none), (pointer: coarse)";

/** 当前是否处于移动端布局（随视口实时变化）。 */
export function isMobileLayout(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
        : false;
}

/**
 * 移动端视口 / 软键盘适配：维护 --mobile-vh、--keyboard-height 与 keyboard-open。
 * 原本是 index.html head 内联脚本外的 IIFE，且靠 window.__SOLARA_IS_MOBILE 判定；
 * 现改为媒体查询判定，仅保留行为差异。
 */
export function initViewportAdaptation(): void {
    if (!isMobileLayout()) return;

    const root = document.documentElement;

    const setViewportUnit = (): void => {
        const viewport = window.visualViewport;
        const windowHeight = window.innerHeight;
        const currentHeight = viewport ? viewport.height : windowHeight;

        const active = document.activeElement;
        const isInputActive = Boolean(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA"));
        const keyboardHeight = Math.max(0, windowHeight - currentHeight);
        const isKeyboardOpen = isInputActive && keyboardHeight > 120;

        if (document.body) {
            document.body.classList.toggle("keyboard-open", isKeyboardOpen);
        }
        root.style.setProperty("--keyboard-height", `${keyboardHeight}px`);

        if (isKeyboardOpen) {
            root.style.setProperty("--mobile-vh", `${currentHeight}px`);
        } else {
            root.style.removeProperty("--mobile-vh");
        }
    };

    setViewportUnit();

    window.addEventListener("resize", setViewportUnit);
    window.addEventListener("orientationchange", setViewportUnit);
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", setViewportUnit);
        window.visualViewport.addEventListener("scroll", setViewportUnit);
    }
    window.addEventListener("focusin", () => setTimeout(setViewportUnit, 100));
    window.addEventListener("focusout", () => {
        setTimeout(() => {
            if (document.body) document.body.classList.remove("keyboard-open");
            root.style.setProperty("--keyboard-height", "0px");
            setViewportUnit();
        }, 150);
    });
}
