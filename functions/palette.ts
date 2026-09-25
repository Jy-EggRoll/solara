import decodeJpeg from "./lib/vendor/jpeg-decoder.js";
import {
    MAX_DIMENSION,
    TARGET_SAMPLE_COUNT,
    hslToHex,
    hslToRgb,
    pickContrastColor,
    resizeImage,
    rgbToHsl,
    adjustSaturation,
    adjustLightness,
} from "./lib/palette-core.js";

type SupportedFormat = "jpeg" | "jpg" | "pjpeg";

interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

class UnsupportedImageFormatError extends Error {
    constructor(format: string) {
        super(`Unsupported image format: ${format}`);
        this.name = "UnsupportedImageFormatError";
    }
}

interface PaletteStop {
    gradient: string;
    colors: string[];
}

interface ThemeTokens {
    primaryColor: string;
    primaryColorDark: string;
}

interface PaletteResponse {
    source: string;
    baseColor: string;
    averageColor: string;
    accentColor: string;
    contrastColor: string;
    gradients: Record<"light" | "dark", PaletteStop>;
    tokens: Record<"light" | "dark", ThemeTokens>;
}

interface HslColor {
    h: number;
    s: number;
    l: number;
}

interface AnalyzedColors {
    average: HslColor;
    accent: HslColor;
}

function analyzeImageColors(image: DecodedImage): AnalyzedColors {
    const { data } = image;
    const totalPixels = data.length / 4;
    const step = Math.max(1, Math.floor(totalPixels / TARGET_SAMPLE_COUNT));

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let count = 0;

    let accent: { color: HslColor; score: number } | null = null;

    for (let index = 0; index < data.length; index += step * 4) {
        const alpha = data[index + 3];
        if (alpha < 48) {
            continue;
        }

        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];

        totalR += r;
        totalG += g;
        totalB += b;
        count++;

        const hsl = rgbToHsl(r, g, b);
        const vibrance = hsl.s;
        const balance = 1 - Math.abs(hsl.l - 0.5);
        const score = vibrance * 0.65 + balance * 0.35;

        if (!accent || score > accent.score) {
            accent = { color: hsl, score };
        }
    }

    if (count === 0) {
        throw new Error("No opaque pixels available for analysis");
    }

    const averageR = totalR / count;
    const averageG = totalG / count;
    const averageB = totalB / count;
    const average = rgbToHsl(averageR, averageG, averageB);

    const accentColor = accent ? accent.color : average;

    return {
        average,
        accent: accentColor,
    };
}

function buildGradientStops(accent: HslColor): { light: PaletteStop; dark: PaletteStop } {
    const lightColors = [
        hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.4, 0.08), l: adjustLightness(accent.l, 0.42, 0.52) }),
        hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.52, 0.05), l: adjustLightness(accent.l, 0.26, 0.62) }),
        hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.65), l: adjustLightness(accent.l, 0.12, 0.72) }),
    ];

    const darkColors = [
        hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.55, 0.04), l: adjustLightness(accent.l, 0.14, 0.38) }),
        hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.62, 0.02), l: adjustLightness(accent.l, 0.04, 0.3) }),
        hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.72), l: adjustLightness(accent.l, -0.04, 0.22) }),
    ];

    return {
        light: {
            colors: lightColors,
            gradient: `linear-gradient(140deg, ${lightColors[0]} 0%, ${lightColors[1]} 45%, ${lightColors[2]} 100%)`,
        },
        dark: {
            colors: darkColors,
            gradient: `linear-gradient(135deg, ${darkColors[0]} 0%, ${darkColors[1]} 55%, ${darkColors[2]} 100%)`,
        },
    };
}

function buildThemeTokens(accent: HslColor): Record<"light" | "dark", ThemeTokens> {
    return {
        light: {
            primaryColor: hslToHex({
                h: accent.h,
                s: adjustSaturation(accent.s, 0.6, 0.06),
                l: adjustLightness(accent.l, 0.22, 0.6),
            }),
            primaryColorDark: hslToHex({
                h: accent.h,
                s: adjustSaturation(accent.s, 0.72, 0.02),
                l: adjustLightness(accent.l, 0.06, 0.52),
            }),
        },
        dark: {
            primaryColor: hslToHex({
                h: accent.h,
                s: adjustSaturation(accent.s, 0.58, 0.04),
                l: adjustLightness(accent.l, 0.16, 0.42),
            }),
            primaryColorDark: hslToHex({
                h: accent.h,
                s: adjustSaturation(accent.s, 0.68),
                l: adjustLightness(accent.l, 0.02, 0.32),
            }),
        },
    };
}

function decodeImage(arrayBuffer: ArrayBuffer, contentType: string): DecodedImage {
    const subtype = contentType.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
    const supported: SupportedFormat[] = ["jpeg", "jpg", "pjpeg"];
    if (!supported.includes(subtype as SupportedFormat)) {
        throw new UnsupportedImageFormatError(subtype);
    }

    const bytes = new Uint8Array(arrayBuffer);
    const decoded = decodeJpeg(bytes, {
        useTArray: true,
        formatAsRGBA: true,
    });

    const image: DecodedImage = {
        width: decoded.width,
        height: decoded.height,
        data: new Uint8ClampedArray(decoded.data),
    };

    return resizeImage(image);
}

async function buildPalette(arrayBuffer: ArrayBuffer, contentType: string): Promise<PaletteResponse> {
    const imageData = decodeImage(arrayBuffer, contentType);
    const analyzed = analyzeImageColors(imageData);
    const gradientStops = buildGradientStops(analyzed.accent);
    const tokens = buildThemeTokens(analyzed.accent);

    const accentRgb = hslToRgb(analyzed.accent.h, analyzed.accent.s, analyzed.accent.l);

    return {
        source: "",
        baseColor: hslToHex(analyzed.accent),
        averageColor: hslToHex(analyzed.average),
        accentColor: hslToHex(analyzed.accent),
        contrastColor: pickContrastColor(accentRgb),
        gradients: {
            light: gradientStops.light,
            dark: gradientStops.dark,
        },
        tokens,
    };
}

function createCorsHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init);
    headers.set("Access-Control-Allow-Origin", "*");
    return headers;
}

function createJsonHeaders(status: number): Headers {
    const headers = createCorsHeaders({
        "Content-Type": "application/json; charset=utf-8",
    });
    headers.set("Cache-Control", status === 200 ? "public, max-age=3600" : "no-store");
    return headers;
}

function handleOptions(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        },
    });
}

export async function onRequest({ request }: { request: Request }): Promise<Response> {
    if (request.method === "OPTIONS") {
        return handleOptions();
    }

    if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: createJsonHeaders(405),
        });
    }

    const url = new URL(request.url);
    const imageParam = url.searchParams.get("image") ?? url.searchParams.get("url");

    if (!imageParam) {
        return new Response(JSON.stringify({ error: "Missing image parameter" }), {
            status: 400,
            headers: createJsonHeaders(400),
        });
    }

    let target: URL;
    try {
        target = new URL(imageParam);
    } catch {
        return new Response(JSON.stringify({ error: "Invalid image URL" }), {
            status: 400,
            headers: createJsonHeaders(400),
        });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    let upstream: Response;
    try {
        upstream = await fetch(target.toString(), {
            cf: {
                cacheTtl: 3600,
                cacheEverything: true,
                image: {
                    width: MAX_DIMENSION,
                    height: MAX_DIMENSION,
                    fit: "scale-down",
                    quality: 85,
                    format: "jpeg",
                },
            },
        });
    } catch (error) {
        console.warn("Image resizing fetch failed, falling back to original", error);
        upstream = await fetch(target.toString(), {
            cf: {
                cacheTtl: 3600,
                cacheEverything: true,
            },
        });
    }

    if (!upstream.ok) {
        return new Response(JSON.stringify({ error: `Upstream request failed with status ${upstream.status}` }), {
            status: upstream.status,
            headers: createJsonHeaders(upstream.status),
        });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
        return new Response(JSON.stringify({ error: "Unsupported content type" }), {
            status: 415,
            headers: createJsonHeaders(415),
        });
    }

    const buffer = await upstream.arrayBuffer();

    try {
        const palette = await buildPalette(buffer, contentType);
        palette.source = target.toString();

        const response = new Response(JSON.stringify(palette), {
            status: 200,
            headers: createJsonHeaders(200),
        });

        try {
            await cache.put(cacheKey, response.clone());
        } catch (cacheError) {
            console.warn("Failed to cache palette response", cacheError);
        }

        return response;
    } catch (error) {
        if (error instanceof UnsupportedImageFormatError) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 415,
                headers: createJsonHeaders(415),
            });
        }
        console.error("Palette generation failed", error);
        return new Response(JSON.stringify({ error: "Failed to analyze image" }), {
            status: 500,
            headers: createJsonHeaders(500),
        });
    }
}
