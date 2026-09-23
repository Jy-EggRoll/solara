import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/**
 * 渐进式 TS 迁移的解析回退：允许 `.js` 形式的相对导入落到同名 `.ts` 文件。
 *
 * 背景：vite 自带的 `.js → .ts` 映射只对「TS 引用方」生效；存量 .js 文件里写着的
 * `"./foo.js"` 在文件改名为 foo.ts 之后会解析失败。有了这条回退，迁移一个文件
 * 只需重命名，不必回头修改所有引用方的后缀。
 * 仅在同名 .js 确实不存在时才回退，因此不会掩盖真正缺失的模块。
 */
function resolveTsForJsSpecifier(): Plugin {
    return {
        name: "solara:resolve-ts-for-js-specifier",
        enforce: "pre",
        async resolveId(source, importer) {
            if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
            if (await this.resolve(source, importer, { skipSelf: true })) return null;
            return this.resolve(source.replace(/\.js$/, ".ts"), importer, { skipSelf: true });
        },
    };
}

/**
 * Vite 构建配置（已启用）。
 *
 * 产出：dist/，资源带内容哈希（/assets/*）；index.html 为薄入口（逻辑/样式已外置）。
 * 包管理器：pnpm（见 package.json 的 packageManager 字段）。
 * Cloudflare Pages 设置：Build command = `pnpm install --frozen-lockfile && pnpm build`，
 *                        Build output directory = `dist`，Node >= 20。
 *
 * 说明：
 *  - favicon.svg / favicon.png / manifest.json 已置于 public/（按根路径原样服务）。
 *  - css/desktop.css、css/mobile.css 改为常驻 <link>（规则分别作用域于
 *    html.desktop-view / .mobile-view，可安全同时加载）。
 *  - mobile.js 由 js/app.js 动态 import() 拆分，仅移动端拉取；
 *    视口/键盘适配在 js/boot/viewport.js。
 *  - 手动 ?v= 后缀已移除，缓存失效交由内容哈希接管；未配置 _headers，缓存策略交由 Pages 默认。
 */
export default defineConfig({
    base: "/",
    appType: "mpa",
    plugins: [resolveTsForJsSpecifier()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        assetsDir: "assets",
        // 关键：不拆分 CSS。否则移动端覆盖（body.mobile-view …）会与基础/紧凑布局规则
        // 被拆到不同 chunk，加载顺序被打乱，导致 body.layout-compact 反超 body.mobile-view
        //（权重相同、后者需靠顺序取胜），引发封面非圆形、移动端容器高度错乱等问题。
        cssCodeSplit: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                login: resolve(__dirname, "login.html"),
            },
        },
    },
});
