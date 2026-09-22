import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Vite 构建配置（已启用）。
 *
 * 产出：dist/，资源带内容哈希（/assets/*），可长期强缓存；HTML 每次回源校验。
 * 包管理器：pnpm（见 package.json 的 packageManager 字段）。
 * Cloudflare Pages 设置：Build command = `pnpm install --frozen-lockfile && pnpm build`，
 *                        Build output directory = `dist`，Node >= 20。
 *
 * 说明：
 *  - favicon.svg / favicon.png / manifest.json 已置于 public/（按根路径原样服务）。
 *  - css/desktop.css、css/mobile.css 改为常驻 <link>（规则分别作用域于
 *    html.desktop-view / .mobile-view，可安全同时加载）。
 *  - mobile.js 由 js/app.js 动态 import() 拆分，仅移动端拉取。
 *  - 手动 ?v= 后缀已移除，缓存失效交由内容哈希接管。
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
