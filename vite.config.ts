import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Vite 构建“种子”（当前休眠）。
 *
 * 现状：Cloudflare Pages 以“无构建直发仓库根”部署，本配置文件不会被执行，
 * index.html/login.html/css/js 仍按裸静态资源提供，手动 `?v=` 后缀负责初步防缓存。
 *
 * 若要切换到自动内容哈希（彻底免强刷），还需：
 *  1) Pages 后台设置 Build command = `npm ci && npm run build`，Output = `dist`，Node >= 20。
 *  2) 将 favicon.svg / favicon.png / manifest.json 移入 public/（供 JS 里的 `/favicon.png` 绝对引用）。
 *  3) index.html 里把运行时用 JS 注入的 css/desktop.css、css/mobile.css 改为普通 `<link>`
 *     （两者规则分别作用域于 html.desktop-view / .mobile-view，可安全常驻加载），
 *     并删除底部 `js/mobile.js` 的注入块，改由 app.js 里 `import("./mobile.js")` 动态分块。
 *  4) 届时可移除手动的 `?v=` 后缀，由 hash 文件名接管缓存失效。
 */
export default defineConfig({
    base: "/",
    appType: "mpa",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        assetsDir: "assets",
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                login: resolve(__dirname, "login.html"),
            },
        },
    },
});
