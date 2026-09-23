/**
 * WCAG 2.1 对比度工具（成功准则 1.4.3 Contrast Minimum / AA）。
 * 普通文本要求 4.5:1，大文本 3:1；不达标时沿明度轴把颜色变换到刚好达标，
 * 尽量保留原色相与饱和度，避免"为了可读性把颜色洗掉"。
 */

export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;

const RE_HEX_SHORT = /^#([\da-f])([\da-f])([\da-f])$/i;
const RE_HEX_LONG = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i;
const RE_RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)[\s,/]*([\d.%]*)\s*\)$/i;
const RE_FIRST_COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clamp255 = (value) => clamp(Math.round(Number(value) || 0), 0, 255);

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()，无法解析返回 null。 */
export function parseColor(value) {
    if (typeof value !== "string") return null;
    const input = value.trim();
    if (!input) return null;

    const short = input.match(RE_HEX_SHORT);
    if (short) {
        return {
            r: parseInt(short[1] + short[1], 16),
            g: parseInt(short[2] + short[2], 16),
            b: parseInt(short[3] + short[3], 16),
            a: 1,
        };
    }

    const long = input.match(RE_HEX_LONG);
    if (long) {
        return {
            r: parseInt(long[1], 16),
            g: parseInt(long[2], 16),
            b: parseInt(long[3], 16),
            a: long[4] === undefined ? 1 : parseInt(long[4], 16) / 255,
        };
    }

    const fn = input.match(RE_RGB);
    if (fn) {
        const rawAlpha = fn[4];
        const alpha = !rawAlpha ? 1 : rawAlpha.endsWith("%") ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha);
        return {
            r: clamp255(fn[1]),
            g: clamp255(fn[2]),
            b: clamp255(fn[3]),
            a: Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1,
        };
    }

    return null;
}

/** 取出字符串里第一个颜色（用于从渐变声明里拿一个代表色）。 */
export function firstColorIn(value) {
    if (typeof value !== "string") return null;
    const matched = value.match(RE_FIRST_COLOR);
    return matched ? matched[0] : null;
}

export function toHex(color) {
    const hex = (channel) => clamp255(channel).toString(16).padStart(2, "0");
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

/** WCAG 相对亮度（不含 alpha，调用方需先 composite 出不透明色）。 */
export function relativeLuminance(color) {
    const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
        const ratio = channel / 255;
        return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度：(L1 + 0.05) / (L2 + 0.05)。 */
export function contrastRatio(foreground, background) {
    const a = relativeLuminance(foreground);
    const b = relativeLuminance(background);
    const lighter = Math.max(a, b);
    const darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
}

/** 半透明前景压在不透明背景上的等效颜色。 */
export function composite(foreground, background) {
    const alpha = foreground.a ?? 1;
    if (alpha >= 1) {
        return { r: clamp255(foreground.r), g: clamp255(foreground.g), b: clamp255(foreground.b), a: 1 };
    }
    const blend = (fg, bg) => fg * alpha + bg * (1 - alpha);
    return {
        r: clamp255(blend(foreground.r, background.r)),
        g: clamp255(blend(foreground.g, background.g)),
        b: clamp255(blend(foreground.b, background.b)),
        a: 1,
    };
}

function rgbToHsl({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    const delta = max - min;

    if (delta === 0) {
        return { h: 0, s: 0, l: lightness };
    }

    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === red) {
        hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
        hue = (blue - red) / delta + 2;
    } else {
        hue = (red - green) / delta + 4;
    }

    return { h: (hue * 60 + 360) % 360, s: saturation, l: lightness };
}

function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const match = l - chroma / 2;

    let rgb;
    if (hue < 60) rgb = [chroma, secondary, 0];
    else if (hue < 120) rgb = [secondary, chroma, 0];
    else if (hue < 180) rgb = [0, chroma, secondary];
    else if (hue < 240) rgb = [0, secondary, chroma];
    else if (hue < 300) rgb = [secondary, 0, chroma];
    else rgb = [chroma, 0, secondary];

    return {
        r: clamp255((rgb[0] + match) * 255),
        g: clamp255((rgb[1] + match) * 255),
        b: clamp255((rgb[2] + match) * 255),
    };
}

/**
 * 保证 color 对全部 backgrounds 都达到 minRatio；已达标则原样返回。
 * 变换方式：固定色相与饱和度，沿明度轴由近及远扫描，取第一个达标的明度。
 */
export function ensureContrast(color, backgrounds, minRatio = AA_NORMAL_TEXT) {
    const targets = (backgrounds || []).filter(Boolean);
    const base = { r: clamp255(color?.r), g: clamp255(color?.g), b: clamp255(color?.b) };
    if (!targets.length) return toHex(base);

    const passes = (candidate) => targets.every((bg) => contrastRatio(candidate, bg) >= minRatio);
    if (passes(base)) return toHex(base);

    const { h, s, l } = rgbToHsl(base);
    const averageBackgroundLuminance = targets.reduce((total, bg) => total + relativeLuminance(bg), 0) / targets.length;
    // 背景偏亮就往暗处找，偏暗就往亮处找；首选方向不达标时再试反方向
    const directions = averageBackgroundLuminance > 0.5 ? ["dark", "light"] : ["light", "dark"];

    for (const direction of directions) {
        for (let step = 1; step <= 100; step += 1) {
            const progress = step / 100;
            const lightness = direction === "dark" ? l * (1 - progress) : l + (1 - l) * progress;
            const candidate = hslToRgb(h, s, lightness);
            if (passes(candidate)) return toHex(candidate);
        }
    }

    // 背景亮度正好夹在中间（两侧都难达标）：取黑白里对比度更高的一侧
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const blackScore = Math.min(...targets.map((bg) => contrastRatio(black, bg)));
    const whiteScore = Math.min(...targets.map((bg) => contrastRatio(white, bg)));
    return blackScore >= whiteScore ? "#000000" : "#ffffff";
}
