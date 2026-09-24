/**
 * Solara 视觉动效与调试支持 (Spotlight 跟随光效 & Debug Log 浮层)
 */

import { isMobileLayout } from "../core/viewport.js";

export function initSpotlightEffect() {
    // 移动设备触屏操作无需鼠标跟随聚光灯效果，避免无谓的重排计算与能耗
    if (isMobileLayout()) {
        return;
    }

    let ticking = false;
    let card = null;
    let pointerX = 0;
    let pointerY = 0;

    window.addEventListener(
        "mousemove",
        (e) => {
            // --mouse-x/y 只有 .spotlight-card::before 消费，且同时只有指针所在的那张
            // 卡片可见。逐帧回写全部卡片（尤其没有消费者的 .container）只会白白触发
            // 整棵子树样式失效。
            card = e.target instanceof Element ? e.target.closest(".spotlight-card") : null;
            pointerX = e.clientX;
            pointerY = e.clientY;
            if (!card || ticking) return;

            ticking = true;
            window.requestAnimationFrame(() => {
                ticking = false;
                const target = card;
                if (!target) return;
                const rect = target.getBoundingClientRect();
                target.style.setProperty("--mouse-x", `${pointerX - rect.left}px`);
                target.style.setProperty("--mouse-y", `${pointerY - rect.top}px`);
            });
        },
        { passive: true },
    );
}

function formatDebugEntry(container, message) {
    const entry = document.createElement("div");
    entry.className = "debug-info-entry";

    const timeSpan = document.createElement("span");
    timeSpan.className = "debug-time";
    timeSpan.textContent = new Date().toLocaleTimeString();

    entry.appendChild(timeSpan);

    // 解析前缀徽标，如 [音频] [搜索] [雷达] [歌词] [极光] [错误] [歌单]
    const tagMatch = message.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (tagMatch) {
        const tagText = tagMatch[1];
        const contentText = tagMatch[2];

        const tagSpan = document.createElement("span");
        tagSpan.className = "debug-tag";
        tagSpan.textContent = tagText;

        if (/音频|播放|解码|流/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-audio");
        } else if (/搜索|音源/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-search");
        } else if (/雷达/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-radar");
        } else if (/歌词/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-lyrics");
        } else if (/极光|背景|封面/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-visual");
        } else if (/列表|收藏|歌单/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-playlist");
        } else if (/错误|异常|失败/i.test(tagText)) {
            tagSpan.classList.add("debug-tag-error");
        }

        entry.appendChild(tagSpan);
        entry.appendChild(document.createTextNode(contentText));
    } else {
        entry.appendChild(document.createTextNode(message));
    }

    container.appendChild(entry);
    while (container.childNodes.length > 150) {
        container.removeChild(container.firstChild);
    }
    container.scrollTop = container.scrollHeight;
}

export function createDebugLogger(state, dom) {
    const logger = function debugLog(message) {
        console.log(`[DEBUG] ${message}`);
        if (state && state.debugMode && dom && dom.debugInfo) {
            const container = document.getElementById("debugInfoContent") || dom.debugInfo;
            if (container) {
                formatDebugEntry(container, message);
            }
            dom.debugInfo.classList.add("show");
        }
    };
    // 注册到全局便于各底层模块直接调用
    window.__solaraDebugLog = logger;
    return logger;
}

export function toggleDebugMode(state, dom, debugLog = null) {
    if (!state) return false;
    state.debugMode = !state.debugMode;
    const isEnabled = Boolean(state.debugMode);

    if (dom && dom.debugInfo) {
        if (isEnabled) {
            dom.debugInfo.classList.add("show");
            const logger = debugLog || window.__solaraDebugLog;
            if (typeof logger === "function") {
                logger(`[系统] 调试控制台已启用 (设备: ${isMobileLayout() ? "移动端" : "桌面端"})`);
            }
        } else {
            dom.debugInfo.classList.remove("show");
        }
    }

    // 更新设置模态框中切换按钮的文案与激活样式
    const toggleDebugBtn = document.getElementById("toggleDebugBtn");
    const toggleDebugText = document.getElementById("toggleDebugText");
    if (toggleDebugBtn) {
        toggleDebugBtn.classList.toggle("is-active", isEnabled);
    }
    if (toggleDebugText) {
        toggleDebugText.textContent = `调试模式：${isEnabled ? "开" : "关"}`;
    }

    return isEnabled;
}

/**
 * 为调试控制台绑定拖拽与折叠胶囊横条交互
 */
function setupDraggableAndCollapsible(dom) {
    const debugBox = dom.debugInfo || document.getElementById("debugInfo");
    if (!debugBox) return;

    const header = document.getElementById("debugInfoHeader") || debugBox.querySelector(".debug-info-header");
    const minimizeBtn = document.getElementById("minimizeDebugLogBtn");

    // 1. 折叠 / 展开横条逻辑
    const toggleMinimize = (forceState) => {
        const isMinimized = typeof forceState === "boolean" ? forceState : !debugBox.classList.contains("minimized");

        debugBox.classList.toggle("minimized", isMinimized);
        if (minimizeBtn) {
            minimizeBtn.textContent = isMinimized ? "＋" : "－";
            minimizeBtn.title = isMinimized ? "展开控制台" : "折叠成胶囊横条";
        }
    };

    if (minimizeBtn) {
        minimizeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleMinimize();
        });
    }

    if (header) {
        // 双击标题栏折叠/展开（macOS 经典交互）
        header.addEventListener("dblclick", (e) => {
            if (e.target.closest(".debug-info-actions")) return;
            toggleMinimize();
        });

        // 2. 自由拖拽移动逻辑 (支持 Mouse 与 Touch)
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        const onPointerDown = (e) => {
            if (e.target.closest(".debug-info-actions")) return;
            isDragging = true;
            debugBox.classList.add("is-dragging");

            const rect = debugBox.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;

            // 切换为 left/top 定位，移除默认的 right/bottom
            debugBox.style.left = `${initialLeft}px`;
            debugBox.style.top = `${initialTop}px`;
            debugBox.style.right = "auto";
            debugBox.style.bottom = "auto";

            header.setPointerCapture?.(e.pointerId);
            e.preventDefault();
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            // 视口边缘碰撞保护：禁止拖出视口之外
            const boxWidth = debugBox.offsetWidth;
            const boxHeight = debugBox.offsetHeight;
            const maxLeft = Math.max(8, window.innerWidth - boxWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - boxHeight - 8);

            newLeft = Math.max(8, Math.min(maxLeft, newLeft));
            newTop = Math.max(8, Math.min(maxTop, newTop));

            debugBox.style.left = `${newLeft}px`;
            debugBox.style.top = `${newTop}px`;
        };

        const onPointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            debugBox.classList.remove("is-dragging");
            try {
                header.releasePointerCapture?.(e.pointerId);
            } catch (_) {}
        };

        header.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
    }
}

export function initDebugShortcut(state, dom, debugLog) {
    // 快捷键 Ctrl+D 开启/关闭
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
            e.preventDefault();
            toggleDebugMode(state, dom, debugLog);
        }
    });

    // 绑定调试控制台右上角工具按钮
    const clearBtn = document.getElementById("clearDebugLogBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            const container = document.getElementById("debugInfoContent") || dom.debugInfo;
            if (container) container.innerHTML = "";
        });
    }

    const closeBtn = document.getElementById("closeDebugLogBtn");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            toggleDebugMode(state, dom, debugLog);
        });
    }

    // 装配拖拽与折叠横条交互
    setupDraggableAndCollapsible(dom);
}
