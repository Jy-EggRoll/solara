/**
 * 应用内悬浮提示。
 *
 * 为什么接管原生 title：浏览器自带的提示是系统样式的大白底方框，与界面的玻璃材质无关；
 * 更麻烦的是它由浏览器托管，页面上任何一处 DOM 变动（例如歌词换句时整段重排）
 * 都可能把正在显示的提示顶掉。改由自己的元素渲染后，提示只受指针位置与滚动影响。
 *
 * 为什么不改调用方：事件委托到 document，指针进入带 title 的元素时把文案暂存到
 * data-tooltip-stash 并摘掉 title（阻止原生提示同时弹出），离开时还原。暂存而非搬走，
 * 是为了让 title 继续作为无障碍属性与 i18n 的取值来源，调用方一行都不用改。
 */

const SHOW_DELAY_MS = 300;
const GAP_PX = 10;
const EDGE_PX = 8;

let tipElement: HTMLElement | null = null;
/** 指针或键盘焦点当前所在的锚点；提示要等延迟结束才真正显示 */
let activeAnchor: HTMLElement | null = null;
let showTimer: number | null = null;

function supportsHover(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
}

function ensureTipElement(): HTMLElement {
    if (tipElement) return tipElement;
    const element = document.createElement("div");
    element.className = "app-tooltip";
    element.setAttribute("role", "tooltip");
    element.setAttribute("aria-hidden", "true");
    document.body.appendChild(element);
    tipElement = element;
    return element;
}

/** 进入锚点时摘掉 title 并暂存文案，避免原生提示同时弹出 */
function stashAnchorText(anchor: HTMLElement): string {
    const existingStash = anchor.dataset.tooltipStash;
    if (existingStash !== undefined) return existingStash;
    const text = anchor.getAttribute("title") ?? "";
    if (!text) return "";
    anchor.dataset.tooltipStash = text;
    anchor.removeAttribute("title");
    return text;
}

/**
 * 还原锚点的 title。
 *
 * 悬停期间应用可能重写过 title（例如全屏状态标签会随状态刷新），
 * 这时以新值为准，不要用旧文案覆盖。
 */
function restoreAnchorText(anchor: HTMLElement): void {
    const stash = anchor.dataset.tooltipStash;
    if (stash === undefined) return;
    if (!anchor.hasAttribute("title")) anchor.setAttribute("title", stash);
    delete anchor.dataset.tooltipStash;
}

function placeTip(anchor: HTMLElement, tip: HTMLElement): void {
    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top = anchorRect.top - tipRect.height - GAP_PX;
    if (top < EDGE_PX) top = anchorRect.bottom + GAP_PX;
    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    left = Math.min(Math.max(left, EDGE_PX), window.innerWidth - tipRect.width - EDGE_PX);
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
}

function reveal(anchor: HTMLElement): void {
    const text = stashAnchorText(anchor);
    if (!text) {
        hideTip();
        return;
    }
    const tip = ensureTipElement();
    tip.textContent = text;
    tip.classList.add("show");
    placeTip(anchor, tip);
}

function hideTip(): void {
    if (showTimer !== null) {
        window.clearTimeout(showTimer);
        showTimer = null;
    }
    if (activeAnchor) {
        restoreAnchorText(activeAnchor);
        activeAnchor = null;
    }
    if (tipElement) tipElement.classList.remove("show");
}

function scheduleShow(anchor: HTMLElement): void {
    hideTip();
    activeAnchor = anchor;
    showTimer = window.setTimeout(() => {
        showTimer = null;
        if (activeAnchor === anchor && anchor.isConnected) reveal(anchor);
        else hideTip();
    }, SHOW_DELAY_MS);
}

/** 键盘聚焦时才给提示：鼠标点出来的焦点不该弹提示，与原生行为一致 */
function isKeyboardFocus(element: HTMLElement): boolean {
    try {
        return element.matches(":focus-visible");
    } catch {
        return false;
    }
}

function anchorFrom(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[title]") as HTMLElement | null;
}

function onPointerOver(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // 还在同一个锚点内部（例如从按钮移到它里面的图标）就不要重来一遍
    if (activeAnchor && activeAnchor.contains(target)) return;
    hideTip();
    const anchor = anchorFrom(target);
    if (anchor) scheduleShow(anchor);
}

function onPointerOut(event: PointerEvent): void {
    if (!activeAnchor) return;
    const next = event.relatedTarget;
    if (next instanceof Node && activeAnchor.contains(next)) return;
    hideTip();
}

function onFocusIn(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!isKeyboardFocus(target)) return;
    if (activeAnchor && activeAnchor.contains(target)) return;
    hideTip();
    const anchor = anchorFrom(target);
    if (anchor) scheduleShow(anchor);
}

function onFocusOut(): void {
    hideTip();
}

/**
 * 锚点被换掉（例如列表重排把这一行删了）时要收起提示，
 * 否则指针不动就会留下一个指向已消失元素的提示。
 */
function onPointerMove(): void {
    if (activeAnchor && !activeAnchor.isConnected) hideTip();
}

/**
 * 滚动时按“是否真的动了锚点”决定，不能一见滚动就收起。
 *
 * 歌词换句会让歌词容器自己滚动，而承载提示的按钮并不在那个容器里，位置根本没变。
 * 早期写法一听到滚动事件就收起，正好把提示顶掉，与原生提示被 DOM 变动打断是同一个毛病。
 */
function onScroll(event: Event): void {
    const anchor = activeAnchor;
    if (!anchor) return;
    const target = event.target;
    if (target instanceof Node && target !== document && target.contains(anchor)) {
        // 锚点所在容器滚动了：位置会变，跟着重算
        if (tipElement && tipElement.classList.contains("show")) placeTip(anchor, tipElement);
        return;
    }
    if (target === document || !(target instanceof Node)) {
        // 页面整体滚动，锚点会跟着走，直接收起
        hideTip();
    }
}

export function initAppTooltip(): void {
    // 指针相关监听只在支持悬停的设备上注册：触摸设备上长按不该冒出自绘提示
    if (supportsHover()) {
        document.addEventListener("pointerover", onPointerOver, true);
        document.addEventListener("pointerout", onPointerOut, true);
        document.addEventListener("pointermove", onPointerMove, true);
        document.addEventListener("pointerdown", hideTip, true);
    }

    // 键盘聚焦的提示与设备无关，触屏接外接键盘时同样有用
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") hideTip();
        },
        true,
    );
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hideTip);
    window.addEventListener("blur", hideTip);
}
