/**
 * 调色板底层色彩工具（Cloudflare Functions 与 Docker Node 服务共用）。
 *
 * 仅收敛两端「逐字一致」的纯函数（色值转换 / 亮度 / 缩放），
 * 不含高层分析策略（analyzeImageColors / buildGradientStops / buildThemeTokens）——
 * 那些在两端已分叉，各自保留实现，避免强行合并改变既有视觉效果。
 *
 * 运行时无关：不依赖 DOM、Cloudflare 专有 API 或 Node 专有模块。
 */

export const MAX_DIMENSION = 96;
export const TARGET_SAMPLE_COUNT = 2400;

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function componentToHex(value) {
    const clamped = clamp(Math.round(value), 0, 255);
    return clamped.toString(16).padStart(2, "0");
}

export function rgbToHex({ r, g, b }) {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

export function rgbToHsl(r, g, b) {
    const rNorm = clamp(r / 255, 0, 1);
    const gNorm = clamp(g / 255, 0, 1);
    const bNorm = clamp(b / 255, 0, 1);

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === rNorm) {
            h = ((gNorm - bNorm) / delta) % 6;
        } else if (max === gNorm) {
            h = (bNorm - rNorm) / delta + 2;
        } else {
            h = (rNorm - gNorm) / delta + 4;
        }
        h *= 60;
        if (h < 0) {
            h += 360;
        }
    }

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return { h, s, l };
}

export function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

export function hslToRgb(h, s, l) {
    const saturation = clamp(s, 0, 1);
    const lightness = clamp(l, 0, 1);
    const normalizedHue = (((h % 360) + 360) % 360) / 360;

    if (saturation === 0) {
        const value = lightness * 255;
        return { r: value, g: value, b: value };
    }

    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;

    const r = hueToRgb(p, q, normalizedHue + 1 / 3) * 255;
    const g = hueToRgb(p, q, normalizedHue) * 255;
    const b = hueToRgb(p, q, normalizedHue - 1 / 3) * 255;

    return { r, g, b };
}

export function hslToHex(color) {
    const rgb = hslToRgb(color.h, color.s, color.l);
    return rgbToHex(rgb);
}

export function relativeLuminance(r, g, b) {
    const normalize = (value) => {
        const channel = clamp(value / 255, 0, 1);
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    };

    const rLin = normalize(r);
    const gLin = normalize(g);
    const bLin = normalize(b);

    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function pickContrastColor(color) {
    const luminance = relativeLuminance(color.r, color.g, color.b);
    return luminance > 0.45 ? "#1f2937" : "#f8fafc";
}

export function adjustSaturation(base, factor, offset = 0) {
    return clamp(base * factor + offset, 0, 1);
}

export function adjustLightness(base, offset, factor = 1) {
    return clamp(base * factor + offset, 0, 1);
}

export function resizeImage(image) {
    const maxSide = Math.max(image.width, image.height);
    if (maxSide <= MAX_DIMENSION) {
        return image;
    }

    const scale = MAX_DIMENSION / maxSide;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const resized = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        const srcY = Math.min(image.height - 1, Math.floor(y / scale));
        for (let x = 0; x < width; x += 1) {
            const srcX = Math.min(image.width - 1, Math.floor(x / scale));
            const srcIndex = (srcY * image.width + srcX) * 4;
            const destIndex = (y * width + x) * 4;

            resized[destIndex] = image.data[srcIndex];
            resized[destIndex + 1] = image.data[srcIndex + 1];
            resized[destIndex + 2] = image.data[srcIndex + 2];
            resized[destIndex + 3] = image.data[srcIndex + 3];
        }
    }

    return {
        width,
        height,
        data: resized,
    };
}
