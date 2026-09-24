# Solara 2.0（光域）

<p align="center">
  <a href="https://trendshift.io/repositories/23480" target="_blank"><img src="https://trendshift.io/api/badge/trendshift/repositories/23480/daily?language=JavaScript" alt="#1 JavaScript Repository Of The Day" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/23480" target="_blank"><img src="https://trendshift.io/api/badge/trendshift/repositories/23480/weekly?language=JavaScript" alt="#2 JavaScript Repository Of The Week" width="250" height="55"/></a>
  <a href="https://trendshift.io/repositories/23480" target="_blank"><img src="https://trendshift.io/api/badge/trendshift/repositories/23480/monthly?language=JavaScript" alt="#13 JavaScript Repository Of The Month" width="250" height="55"/></a>
</p>

> **Solara 2.0 重磅进化**：由轻量后端服务支撑的现代化网页音乐播放器。2.0 版本彻底告别单体脚本，迈向现代化工业级模块解耦架构，带来网易云三大官方顶尖榜单音乐雷达、全功能自由拖拽与胶囊折叠调试台、Apple Design 深度流体美学与 iPhone 性能优化，以及极致平滑稳定的全平台播放体验。

![Solara Preview](./Preview.gif)

|                                   |                                   |                                   |
| :-------------------------------: | :-------------------------------: | :-------------------------------: |
| <img src="./1.png" height="700"/> | <img src="./2.png" height="700"/> | <img src="./3.png" height="700"/> |

## 参与贡献

感谢 GD音乐台(music.gdstudio.xyz)提供的免费API

感谢 来自Linux.do 牛就是牛@ufoo 大佬 https://linux.do/t/topic/942415 提供的灵感

## 2.0 核心特性

- **跨站曲库检索与无感记忆**：一键切换数据源（网易云/QQ/酷狗等），切换平台不再误触发自动请求；自动记忆检索关键词与最近搜索结果，重焦即刻恢复；支持分页浏览与批量导入播放队列。
- **官方榜单音乐雷达**：重构为动态轮询网易云三大官方榜单（**热歌榜、飙升榜、新歌榜**）Top 20，并执行实时智能去重与随机注入，兼顾爆款流行与新鲜探索。
- **Apple Design 流体极光美学**：内置亮/暗模式与玻璃拟态界面。采用**前后端双重取色算法**（后端调色板分析 + 前端 Canvas 智能降级），全域无缝消除原生滚动条；重构登录界面，与主站流体极光和磨砂玻璃 100% 视觉对齐。
- **智能边缘缓存**：基于 Cloudflare Cache API 实现。具备**智能过滤机制**，仅缓存有效搜索结果，自动识别并拦截“API 繁忙”导致的空结果或错误结果存入缓存，大幅提升二次搜索速度。
- **轻量后端代理 & D1 跨端漫游**：通过 Cloudflare Pages Functions 统一聚合；原生支持 Cloudflare D1 分布式数据库，PC 端与移动端歌单、收藏夹实时漫游同步。
- **动态歌词视图**：逐行平滑滚动高亮，当前行自动聚焦，手动滚动后锁定视图并支持 3 秒自动回位。
- **收藏列表独立管理**：搜索结果与播放列表均可一键收藏，收藏列表拥有独立的播放进度、播放模式与批量操作面板。
- **多码率自由切换**：支持 128K / 192K / 320K / FLAC 无损等高音质切换并直接获取音频。
- **全平台锁屏控制**：锁屏界面自动同步高分辨率专辑封面与曲目信息，完美支持 MediaSession 标准。
- **列表导入导出**：支持播放队列与收藏列表统一导入/导出，可一键迁移或恢复歌曲。
- **隐藏式高级设置**：桌面端**双击左上角 Logo/站点标题**、移动端**双击顶部标题栏**，即可呼出极简设置面板，配置音质首选项、调试模式开关与个性化参数。
- **全功能调试悬浮窗**：支持桌面/移动端自由拖拽、一键/双击折叠为 38px 胶囊横条，全链路生命周期彩标药丸日志输出。

## 快速上手

支持多种部署方式，您可以根据自己的服务器环境选择最合适的一种：

- [Docker 一键部署 (适合私有服务器)](#docker-一键部署-适合私有服务器)
- [Cloudflare Pages 部署 (适合免服务器托管)](#cloudflare-pages-部署-适合免服务器托管)

---

### Docker 一键部署 (适合私有服务器)

无需下载和编译源码，只需在您的服务器上新建一个空白目录，创建 `docker-compose.yml` 文件，并配置相应的端口映射（默认推荐宿主机端口为 `8080`，可根据需要自行修改，配合 Nginx 等反向代理或直接外网访问）：

> [!NOTE]
> **Docker 版高性能优化**：
> 本镜像已切换为 **Express + Wrangler 混合双引擎架构**，由 Express 前台代理高频数据读写与音频流式管道传输（支持切歌时连接立即自动中止释放，防 Socket 泄漏），由后台 Wrangler 专职负责微量 API 代理（利用 BoringSSL 指纹完美绕过 Cloudflare 验证），从而兼顾极佳的性能、稳定性与 CF 验证通过率。

```yaml
services:
    solara:
        image: ghcr.io/akudamatata/solara:latest
        container_name: solara
        restart: always
        init: true # 解决容器停止时 Node/Wrangler 进程无法优雅响应 SIGTERM 导致卡顿的问题
        ports:
            - "8080:8787" # 宿主机端口:容器内端口（可将 8080 修改为其他未占用的宿主机端口）
        environment:
            # 在这里配置你的 Solara 登录口令
            - PASSWORD=your_secure_password_here
            # 音乐聚合 API 地址（当默认 API 被 Cloudflare 屏蔽/Challenge 时，可更换为备用地址）
            - API_BASE_URL=https://music-api.gdstudio.xyz/api.php
            # 界面语言（默认中文，填 ENG 切换为英文）
            # - language=ENG
        volumes:
            # 持久化 SQLite 数据库（收藏夹和播放记录）
            - ./data:/data
```

---

保存文件后，在同一目录下打开终端，依次执行以下两条命令：

```bash
docker compose pull
docker compose up -d
```

---

### Cloudflare Pages 部署 (适合免服务器托管)

如果您没有自己的服务器，可以直接使用 Cloudflare 免费部署：

1. Fork 或克隆本仓库到您自己的 GitHub 账号下。
2. 登录 Cloudflare 控制台，按 Cloudflare Pages 文档创建站点并连接本仓库；在构建设置中填写 Build command = `pnpm install --frozen-lockfile && pnpm build`、Build output directory = `dist`、Node ≥ 24（详见下方「构建与缓存」）。
3. 部署完成后，通过 Cloudflare Pages 分配的域名访问站点即可。

### 构建与缓存（Vite + pnpm）

前端已接入 **Vite** 构建：资源自动带内容哈希输出到 `dist/assets/*`，HTML 每次回源校验（见 `public/_headers`），**不再需要手动维护 `?v=` 版本号** —— 改任一样式/脚本后重新构建即自动换名，访客（含移动端）无需强刷即可拿到最新版本。

- **Cloudflare Pages 设置**：Build command = `pnpm install --frozen-lockfile && pnpm build`，Build output directory = `dist`，Node ≥ 24。
- **本地开发**：`pnpm install` → `pnpm preview`（先 `vite build`，再以 `dist/` + Pages Functions 起全栈服务，默认 `http://127.0.0.1:8787`）/ `pnpm build`（只产出 `dist/`）/ `pnpm typecheck`（TS 类型检查）。搜歌、播放、`/palette` 取色在 `pnpm preview` 下均可用；可选环境变量写在根目录 `.dev.vars`（已被 gitignore，字段见 `.env.example`），未配置时 `PASSWORD` 为空即不鉴权、`API_BASE_URL` 回落默认节点。本地不绑定 D1，播放记录/收藏自动落到 localStorage。注意：`wrangler pages dev` 在检测到被服务目录变更时会重载，偶尔会自行退出，重跑 `pnpm preview` 即可。
- **TypeScript（渐进迁移中）**：新文件直接写 `.ts`（`tsconfig.json` 走 `strict`，目前只检查 `.ts`，存量 `.js` 作为类型来源但不报错）。把一个文件迁到 TS 只需重命名——`vite.config.ts` 里的解析回退会把 `"./foo.js"` 这种导入落到同名 `.ts`，无需回头改所有引用方；`window` 上由存量 JS 注入的全局契约（如 `__solaraDebugLog`）补在 `src/scripts/types/globals.d.ts`。快捷键统一登记在 `src/scripts/core/shortcuts.ts`（主键 + 修饰键精确匹配、默认输入态不触发）。
- **约定**：`favicon.*`、`manifest.json` 位于 `public/`（按根路径原样服务）；`css/desktop.css`、`css/mobile.css` 作为常驻 `<link>` 交由 Vite 处理；`js/mobile.js` 由 `js/app.js` 动态 `import()` 按需拆分（仅移动端拉取）；`public/js/i18n.js` 为 classic 脚本，保持原路径、不参与哈希。

## 配置提示

- API 基地址定义在 `functions/proxy.ts` 中，可替换为自建接口域名。
- 默认主题、播放模式等偏好可在 `src/scripts/state.js` 初始化逻辑中按需调整。

### Cloudflare D1 绑定与建表

1. 在 Cloudflare Dashboard 的 **Workers & Pages → D1 → Create** 中新建数据库，建议命名为 `solara-db`（名称可自定）。
2. 打开 Pages 项目设置，依次进入 **Settings → Functions → Bindings → Add binding → D1 Database**：
    - **Binding name** 填写 `DB`（必须与 `functions/api/storage.ts` 中的环境变量一致）。
    - **D1 Database** 选择上一步创建的数据库并保存。
3. 在数据库详情页切换到 **Query** 标签页，执行下方建表语句初始化两个独立的键值存储表（播放数据与收藏数据分离）：
    ```sql
    CREATE TABLE IF NOT EXISTS playback_store (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites_store (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    ```
4. 重新部署或预览站点。前端会优先检测 D1 绑定：播放状态、播放列表等写入 `playback_store`，收藏相关写入 `favorites_store`；未绑定时自动退回浏览器 localStorage。

## 音乐雷达 (Official Top Charts Radar)

- **权威官方榜单联动**：雷达每次触发时，会自动从网易云官方三大顶尖榜单——**热歌榜**（3778678）、**新歌榜**（3779629）、**飙升榜**（19723756）中轮询抽取并解析前 20 首曲目。
- **智能去重与随机注入**：自动过滤当前播放列表中已存在的歌曲，经随机乱序后无缝加入队列，让每一次雷达探索既能听到当下最火热的高品质音乐，又能发现宝藏冷门新歌。

## 隐藏高级设置 (双击标题呼出)

为了保持界面的极致极简与沉浸感，播放器的高级设置面板采用了隐式彩蛋交互设计：

- **桌面端**：**双击左上角「Solara」Logo / 站点标题** 即可打开高级设置面板。
- **移动端**：**双击顶部导航栏标题** 即可随时唤出设置。
- **设置能力**：支持自定义勾选雷达抽取榜单（热歌榜/新歌榜/飙升榜）、快捷开关实时调试控制台、配置首选音质解析策略以及查看云端存储状态。

## 访问控制设置

- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `PASSWORD` 的环境变量，值为希望设置的访问口令。
- **Docker 部署：** 在 `docker-compose.yml` 的 `environment` 中设置 `PASSWORD` 环境变量，例如 `- PASSWORD=your_password`。如果不需要密码，可不配置该变量。
- 部署完成后，未登录的访问者会被自动重定向到 `/login` 页面并需输入该口令；若想关闭访问口令，删除该环境变量并重新部署或重启容器即可。

## 多语言设置 (English Version)

- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `LANGUAGE` 的环境变量，值为 `ENG`。
- **Docker 部署：** 在 `docker-compose.yml` 的 `environment` 中设置 `language` 环境变量为 `ENG`，即 `- language=ENG`（注意：Docker 环境下环境变量名是小写 `language`，以与 wrangler 本地开发环境一致）。
- 部署完成后，站点将会自动切换为全英文界面。若想恢复中文界面，删除该环境变量或修改为其他值后重新部署或重启容器即可。

## 使用流程

1. 输入关键词并选择想要的曲库后发起搜索（切换曲库不自动清空和刷新）。
2. 在结果列表中可试听、播放、下载或加入播放队列。
3. 点击列表中的心形图标即可收藏歌曲，收藏列表支持快捷下载、添加至播放列表或批量清空。
4. 右侧播放/收藏列表展示当前曲目，可拖动播放、移除或一键清空。
5. 底部控制栏提供播放控制、播放模式切换、进度条与音量滑块。
6. 打开歌词面板即可查看实时滚动的高亮歌词。

## 移动端体验提示

- 将网页添加到手机主屏（PWA 体验）或通过移动浏览器访问，自动切换至竖屏极简布局；
- 底栏控件重新排布，保证竖向滑动不遮挡核心信息；
- 虚拟键盘唤起时自适应视口高度，保证搜索面板操作不被遮挡；
- 点击封面可切换到沉浸式歌词面板，支持丝滑手势展开/收起。

## 常见问题解答

- **搜索没有结果怎么办？** 检查浏览器控制台日志，如接口被阻挡可尝试切换数据源或更新 `API.baseUrl` 至可用服务，很有可能是免费 API 临时波动。
- **如何重置本地数据？** 在浏览器开发者工具的 Application / Storage 面板清理 `localStorage`，即可恢复默认播放列表和配置。
- **收藏或播放列表如何备份？** 使用播放队列或收藏列表顶部的「导出」按钮生成 JSON 文件，日后可通过对应列表的「导入」按钮恢复，同时可一键将收藏歌曲添加回播放列表。

## 调试控制台 (Debug Console)

- **呼出方式**：PC 端按下快捷键 **Ctrl + D**；移动端可在「设置」面板中一键开启。
- **自由拖拽**：按住控制台顶部标题栏可自由拖拽至屏幕任意角落，具备可视窗口边缘碰撞保护，防止拖出屏幕。
- **胶囊横条折叠**：点击右上角折叠按钮（`－` / `＋`）或**双击标题栏**，面板即刻平滑收缩为 38px 高度的单行胶囊横条，不遮挡界面，且在折叠状态下依然支持拖动停靠。
- **全链路彩标药丸日志**：

| 日志徽标     | 监控范围 | 核心记录指标                                                                    |
| :----------- | :------- | :------------------------------------------------------------------------------ |
| `[音频播放]` | 播放核心 | 切歌事件、码率音质选择（128k/320k/999k）、音频直链/代理耗时、解码就绪与异常重试 |
| `[歌曲搜索]` | 检索链路 | 发起搜索、音源平台、请求关键词、分页页码、API 返回曲目数量与缓存状态            |
| `[音乐雷达]` | 榜单抓取 | 官方榜单名称/ID、抓取 Top 20 进度、智能去重增量曲目数                           |
| `[歌词解析]` | 歌词引擎 | 歌词请求 URL、成功解析有效行数统计、暂无歌词/错误降级                           |
| `[极光背景]` | 视觉渲染 | 封面图片地址、本地色盘缓存命中、内存复用、云端后端/前端 Canvas 取色             |
| `[播放列表]` | 队列状态 | 单曲增删（实时剩余数追踪）、列表清空、收藏增删、循环播放模式切换                |
| `[异常错误]` | 容灾防线 | 网络断开、API 鉴权失败、音频上下文被阻断拦截警告                                |

---

## 项目结构 (现代化模块解耦架构)

```
Solara/
├── src/                       # 前端源码（构建入口 index.html / login.html 位于仓库根）
│   ├── scripts/
│   │   ├── app.js             # 主应用调度中心，负责模块装配与事件聚合
│   │   ├── mobile.js          # 移动端入口，由 app.js 动态 import() 按需加载
│   │   ├── state.js           # 全局状态机
│   │   ├── constants.ts       # 系统常量、榜单配置与后端 API 代理客户端
│   │   ├── dom.js             # DOM 元素缓存池
│   │   ├── core/              # 基础设施层（不反向依赖业务层）
│   │   │   ├── audio.js           # 播放器底层状态机、防抖与请求熔断器
│   │   │   ├── quality.js         # 音质码率协商与流地址解析
│   │   │   ├── storage.ts         # 本地持久化与 Cloudflare D1 漫游驱动
│   │   │   ├── contrast.ts        # WCAG 对比度计算与色彩变换
│   │   │   ├── shortcuts.ts       # 全局快捷键注册表
│   │   │   ├── viewport.ts        # 设备布局判定（媒体查询）与视口/软键盘适配
│   │   │   ├── fullscreen.ts      # 全屏状态同步与 F 键登记
│   │   │   ├── wake-lock.js       # 防息屏锁
│   │   │   └── media-session.js   # 全平台锁屏控制器与元数据同步
│   │   ├── features/          # 业务特性层
│   │   │   ├── search.js          # 搜索引擎、结果缓存与防抖
│   │   │   ├── playlist.js        # 播放队列管理（防幽灵播放、删歌指针重定位）
│   │   │   ├── favorites.js       # 收藏夹独立管理与持久化
│   │   │   ├── lyrics.js          # 动态歌词解析与高亮滚动引擎
│   │   │   └── settings.js        # 个性化设置与参数配置
│   │   ├── visual/            # 画面与主题层
│   │   │   ├── aurora.js          # 封面底图、调色板落地与文字可读性校验
│   │   │   ├── palette.js         # 智能双通道封面取色算法
│   │   │   └── spotlight.js       # 聚光灯跟随与调试控制台（可拖拽/折叠/彩标日志）
│   │   ├── mobile/            # 移动端手势与抽屉交互
│   │   │   └── gestures.js / sheet.js / stage.js / search.js / toolbar.js / core.js
│   │   ├── types/             # 全局类型契约（window 扩展等）
│   └── styles/                # 样式：tokens → layout → components → mobile
│       ├── style.css / mobile.css      # 两个聚合入口（@import 各层）
│       ├── desktop.css / eco-mode.css  # 桌面端补齐与省电模式
│       ├── tokens/theme.css            # 设计系统 Token：色彩、材质、动效周期
│       ├── layout/ · components/ · mobile/
├── functions/                 # Cloudflare Pages Functions 边缘服务
│   ├── _middleware.ts         # 统一认证与路由中间件
│   ├── api/                   # 各曲库代理入口与 D1 存储路由
│   ├── palette.ts             # 边缘端封面取色分析
│   └── proxy.ts               # 音频流直链签名剥离与流式代理
├── server/                    # Docker 混合引擎宿主（Express + SQLite）
│   ├── routes/                # 代理路由与取色分析
│   ├── index.js               # Express 服务入口
│   └── db.js                  # 高性能 SQLite 数据库驱动 (WAL 模式)
├── index.html                 # 播放器主应用入口
├── login.html                 # Apple Design 风格登录页
├── Dockerfile                 # 容器构建配置
└── README.md                  # 项目文档
```

**目录与命名约定**（新增代码请遵守）：

- 源码一律进 `src/`：逻辑放 `src/scripts`，样式放 `src/styles`；只有**必须保留原始 URL** 的资源才放 `public/`（如 classic 脚本 `public/js/i18n.js`）
- `functions/`、`index.html`、`login.html` 必须留在仓库根（Cloudflare Pages 与构建入口的约定）
- 依赖方向自上而下：`app → features / visual / mobile → core`；`core` 不反向依赖业务层，新增的通用能力优先落在 `core`
- **布局模式一律用媒体查询判定，禁止用 JS 往 `<html>`/`<body>` 上派发设备类**（理由：宽窗/分屏/旋转会让 UA 判定与实际视口脱节，且类驱动的覆盖层难以维护）。权威定义只有一处，改则两处同步：
    - 移动端布局 = `(max-width: 820px), (hover: none), (pointer: coarse)`
    - 桌面端布局 = `(min-width: 821px) and (hover: hover) and (pointer: fine)`
    - JS 侧需要"行为差异"时查 `core/viewport.ts` 的 `isMobileLayout()`（与样式同一条件）
- 新文件优先写 `.ts`（`pnpm typecheck` 目前只检查 TS 文件，存量 JS 逐步迁移；迁移只需重命名，构建会自动把 `"./foo.js"` 这类导入落到同名 `.ts`）
- **样式层叠（迁移中）**：现有 500+ 个 `!important` 多是为跨文件覆盖"抢胜负"而加的历史债。计划顺序是「**先降 `!important`，再迁 `@layer`**」——因为 layer 中 `!important` 的优先级顺序与普通声明**相反**（早层胜晚层），而 `color` / `display` / `transform` 等属性在 8~9 个文件里都带 `!important`，整体加层会成片翻转胜负，无法保证无回归。`pnpm check:css` 是止血阀：新增 `!important` 会让检查失败；删掉后请同步调小 `scripts/check-css-budget.mjs` 里的预算，让刻度只往下走。
- 快捷键不要各自绑 `keydown`，统一登记到 `src/scripts/core/shortcuts.ts`
- `window` 上由存量 JS 注入的全局（如 `__solaraDebugLog`）补进 `src/scripts/types/globals.d.ts`，不要在业务代码里用 `any` 绕过

## 许可证

本项目采用 CC BY-NC-SA 协议，禁止任何商业化行为，任何衍生项目必须保留本项目地址并以相同协议开源。
