/**
 * 移动端视口 / 键盘适配(自 index.html head 内联脚本外置)。
 * 仅移动端生效:维护 body.mobile-view、--mobile-vh、--keyboard-height、keyboard-open。
 * 依赖 window.__SOLARA_IS_MOBILE(由 index.html 首帧内联脚本预置)。
 */
(function () {
    if (!window.__SOLARA_IS_MOBILE) return;

    const root = document.documentElement;

    const setViewportUnit = () => {
        const vv = window.visualViewport;
        const winH = window.innerHeight;
        const currentH = vv ? vv.height : winH;

        const isInputActive = Boolean(
            document.activeElement &&
            (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA"),
        );
        const keyboardHeight = Math.max(0, winH - currentH);
        const isKeyboardOpen = isInputActive && keyboardHeight > 120;

        if (document.body) {
            document.body.classList.toggle("keyboard-open", isKeyboardOpen);
        }
        root.style.setProperty("--keyboard-height", `${keyboardHeight}px`);

        if (isKeyboardOpen) {
            root.style.setProperty("--mobile-vh", `${currentH}px`);
        } else {
            root.style.removeProperty("--mobile-vh");
        }
    };

    const applyBodyClass = () => {
        if (document.body) {
            document.body.classList.add("mobile-view");
            setViewportUnit();
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyBodyClass, { once: true });
    } else {
        applyBodyClass();
    }

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
})();
