# Komari Theme Commander

![GitHub License](https://img.shields.io/github/license/wayjam/komari-theme-commander)
![GitHub Release](https://img.shields.io/github/v/release/wayjam/komari-theme-commander)

![Commander Theme — DeepSpace + Lumina preview](https://raw.githubusercontent.com/wayjam/komari-theme-commander/main/preview.png)

> 一个为 [Komari Monitor](https://github.com/komari-monitor/komari) 打造的现代化监控主题，提供清晰的多视图运维界面；DeepSpace 主题保留赛博朋克指挥台与终端 HUD 视觉，Lumina 与 Clean 则偏向明亮、克制的信息呈现。

## 🚀 Quick Start

- 从 [Release](https://github.com/wayjam/komari-theme-commander/releases) 下载主题 zip 包，上传到 Komari 后台即可。
- 或在 Komari 后台填写主题 URL：`https://github.com/wayjam/komari-theme-commander`

## ✨ 核心特性

### 🎨 三款精心设计的主题

| Lumina（光明） | DeepSpace（深空） | Clean（简洁） |
| :---: | :---: | :---: |
| 清新明亮的浅色主题<br/>保留轻量扫描线与发光描边 | 赛博朋克深色主题<br/>星空背景、指挥框角与终端 HUD 装饰 | 极简主义浅色主题<br/>无装饰，专注信息呈现 |

> 支持 **auto** 模式，自动跟随系统配色（light → Lumina，dark → DeepSpace）。

### 🌍 多维视图体系

- **Globe View（地球视图）** — 基于 3D 点状地球可视化展示全球服务器分布，支持交互式旋转、节点高亮、Hub 节点弧线动画
- **Grid View（网格视图）** — 卡片式布局，三段式阈值告警（normal / warning / critical），单卡即可看全实时指标
- **Table View（表格视图）** — 紧凑型表格 + 内嵌迷你流量趋势图，适合管理大量节点
- **Uptime View（在线时长视图）** — 节点可用性时间线 + SLO 评分，快速识别稳定性问题

### 📊 强大的数据可视化

- **实时监控面板** — WebSocket 2 秒轮询，展示 CPU/RAM/Disk/Network/Uptime 实时数据
- **节点详情页（Charts）** — 环形进度 + 系统硬件信息卡片 + 时序图表（CPU、负载、内存 + Swap、磁盘、TCP/UDP 连接数、网络流量、Ping 延迟）
- **专属网络页（Network）** — 上传/下载实时速率、累计流量、连接数变化、面积式流量图
- **智能状态指示** — 三级阈值告警（正常 / 警告 / 严重），颜色编码清晰易读
- **时间范围切换** — 1H / 6H / 24H / 7D / 30D 灵活回溯

### 🎯 高级功能

- **智能过滤系统** — Grid / Table 支持按组、标签、在线状态（含即将到期）筛选，以及按到期时间排序；侧边节点流支持按 CPU / 流量排序
- **计费汇总（Billing Summary）** — Grid / Table 视图可开启计费汇总弹窗，按币种汇总周期费用、月均支出与剩余价值，并支持按分组 / 区域查看明细（需登录，主题设置中默认关闭）
- **Globe Hub 模式** — 配置任意节点为「中枢」后，地球上会以该节点为中心绘制到其它在线节点的弧线动画
- **隐私模式（Privacy Mode）** — 一键将所有节点名替换为随机假名（如 `Sierra-Host-426`），适合公开分享演示
- **流量配额监控** — 可视化展示流量使用情况（支持 MAX / ↑+↓ 多种统计口径）
- **到期时间提醒** — 自动计算并高亮显示即将到期的节点
- **自动重连机制** — WebSocket 断线自动重连，保证数据连续性
- **响应式设计** — 完美适配桌面端、平板和移动设备

### 📱 PWA 支持

- **可安装应用体验** — 内置 Web App Manifest、Apple Touch Icon、maskable icon 与移动端状态栏适配，可添加到桌面或手机主屏
- **离线应用外壳** — 预缓存主题静态资源、图表和地球视图相关 chunk，已安装 PWA 可在网络异常时打开最后一次加载过的界面
- **最后状态快照** — 节点列表、最新在线状态和公开站点信息会写入本地快照；后端不可达时优先展示最近一次有效数据，并标记为 stale
- **安全的更新提示** — 新版本不会静默刷新监控面板，而是通过 toast 提示用户选择合适时机 reload
- **不缓存实时 API** — `/api`、WebSocket、`/admin`、`/terminal` 不进入 Service Worker 兜底，实时监控数据仍由 Komari 后端直接提供

### 🌐 国际化支持

- 内置 **English / 简体中文 / 繁體中文** 三语
- 基于 i18next，浏览器语言自动检测
- 用户偏好持久化存储（`localStorage`）

## 📸 主题预览

完整截图预览请参见 [`images/screenshot/README.md`](./images/screenshot/README.md)。

## ⚙️ 主题配置

主题在 Komari 后台的 **Theme Settings** 面板提供可视化配置，所有修改实时生效（切换回前台标签页后自动刷新，无需硬重载）。

配置项定义见 [`komari-theme.json`](./komari-theme.json)，通过 `theme_settings` 下发至前端。

### 视图设置（View Settings）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `default_view` | select | `globe` | 首次访问时展示的视图模式（`globe` / `grid` / `table` / `uptime`）。若所选视图被禁用，会自动回退到第一个可用视图 |
| `enable_globe` | switch | ✅ | 是否显示 3D 地球视图选项 |
| `globe_hub_node` | string | 空 | 指定一个节点名作为地球中枢；启用后该节点会被点亮，并绘制到其它在线节点的弧线动画。即使开启隐私模式，此处仍需填写**真实节点名**；留空则禁用弧线 |
| `globe_mode` | select | `dynamic` | 地球旋转模式：`dynamic` 加载后自动旋转；`static` 默认静止，需用户手动开启旋转（拖拽始终可用） |
| `globe_respect_reduced_motion` | switch | ❌ | 开启后，对偏好「减少动效」的用户暂停地球自动旋转（仍可手动拖拽） |
| `globe_marker_style` | select | `rich` | 地球节点标记样式：`rich` 脉冲动画 + Hub 速度标签；`calm` 扁平标记，保留点击与选中标签；`lite` 仅 WebGL 圆点，CPU 占用更低，需从侧栏或移动端舰队列表选择节点 |
| `enable_uptime` | switch | ✅ | 是否显示在线时长排行视图选项 |
| `enable_asset_stats` | switch | ❌ | 是否在 Grid / Table 视图显示「计费汇总」按钮。汇总各节点计费周期、月均支出与剩余价值，支持按分组或区域查看明细；**仅对已登录用户显示**，多币种分别汇总、不做汇率换算 |

### 外观设置（Appearance）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `default_theme` | select | `clean` | 首次访问者的默认配色主题（`lumina` / `deepspace` / `clean` / `auto`）。`auto` 会跟随系统：light → Lumina，dark → DeepSpace |
| `custom_footer` | string | 空 | 自定义页脚区域显示的文本内容 |
| `enable_privacy_mode` | switch | ❌ | 开启后，**所有用户**（含已登录）看到的节点名称将替换为随机假名以保护隐私；已登录管理员仍可通过头部按钮临时关闭隐私模式 |

## ⚙️ Development

### 前置要求

- Node.js 18+
- pnpm 8+

### 安装依赖

```bash
git clone https://github.com/wayjam/komari-theme-commander.git
cd komari-theme-commander
pnpm install
```

### 开发模式

```bash
pnpm run dev
```

Vite 开发服务器默认在 `http://localhost:5174` 启动（可通过 `VITE_DEV_SERVER_PORT` 覆盖），支持 HMR 热更新。开发环境通过环境变量 `VITE_API_TARGET` 指向真实 Komari 后端（参考 `.env.example`）。

> PWA Service Worker 在 `vite dev` 下默认关闭，避免影响 HMR 和 `/api` 代理；如需验证 PWA，请使用生产构建/预览或安装后的 PWA 窗口。

### 构建生产版本

```bash
pnpm run build
```

构建产物输出至 `dist/` 目录，经过 TypeScript 检查和 Vite 优化。

### 打包主题

```bash
pnpm run package
```

将 `dist/`、`komari-theme.json`、`preview.png` 打包成 `komari-theme-commander.zip`，可直接上传至 Komari 后台。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📝 开发规范

- 代码风格遵循 ESLint 配置（`eslint.config.js`）
- 使用 TypeScript 严格模式
- 组件优先使用函数式编程 + Hooks
- 样式使用 Tailwind CSS utility classes
- 提交信息遵循 Conventional Commits

## 📄 License

Released under the [MIT License](https://github.com/wayjam/komari-theme-commander/blob/main/LICENSE).
