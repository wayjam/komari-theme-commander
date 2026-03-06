# Komari Theme Commander

![GitHub License](https://img.shields.io/github/license/wayjam/komari-theme-commander)
![GitHub Release](https://img.shields.io/github/v/release/wayjam/komari-theme-commander)

![screenshot](https://raw.githubusercontent.com/wayjam/komari-theme-commander/main/preview.png)

> 一个为 [Komari Monitor](https://github.com/komari-monitor/komari) 量身打造的现代化指挥官主题，融合赛博朋克美学与终端 HUD 风格，提供沉浸式的服务器监控体验。

## ✨ 核心特性

### 🎨 三款精心设计的主题

- **Lumina（光明）** — 清新明亮的浅色主题，适合日间使用
- **DeepSpace（深空）** — 赛博朋克风格的深色主题，带有星空特效和扫描线
- **Clean（简洁）** — 极简主义设计，专注信息呈现

### 🌍 多维视图体系

- **Globe View（地球视图）** — 基于 3D 地球可视化展示全球服务器分布，支持交互式旋转和节点选择
- **Grid View（网格视图）** — 卡片式布局，展示节点实时状态和资源使用情况
- **Table View（表格视图）** — 紧凑型表格，适合管理大量节点
- **Uptime View（在线时长视图）** — 节点可用性排行榜，快速识别稳定性

### 📊 强大的数据可视化

- **实时监控面板** — WebSocket 2 秒轮询，展示 CPU/RAM/Disk/Network/Uptime 实时数据
- **历史图表分析** — 支持 1h/6h/24h/7d 时间范围切换，包含：
  - CPU 使用率趋势
  - 系统负载（Load 1/5/15）
  - 内存与 Swap 使用情况
  - 磁盘空间变化
  - TCP/UDP 连接数
  - 网络流量（双向上下行）
  - Ping 延迟监控
- **智能状态指示** — 三级阈值告警（正常/警告/严重），颜色编码清晰易读

### 🎯 高级功能

- **智能过滤系统** — 支持按组、标签、在线状态多维度筛选节点
- **侧边栏详情视图** — Globe 视图中点击节点可在侧边栏展开完整系统信息和资源图表
- **流量限制监控** — 可视化展示流量配额使用情况（支持上行/下行/总量）
- **到期时间提醒** — 自动计算并高亮显示即将到期的节点
- **自动重连机制** — WebSocket 断线自动重连，保证数据连续性
- **响应式设计** — 完美适配桌面端、平板和移动设备

### 🌐 国际化支持

- 内置简体中文、繁体中文、英文三语言
- 基于 i18next，浏览器语言自动检测
- 用户偏好持久化存储

### ⚙️ 管理端配置

主题提供后台可视化配置面板（无需修改代码）：

- **默认视图** — 选择用户首次访问时展示的视图模式
- **视图启用开关** — 灵活控制 Globe/Uptime 视图的显示与隐藏
- **默认主题** — 为首次访问者预设颜色主题
- **自定义页脚** — 添加自定义文本内容到页脚区域

配置项通过 Komari 后台的 `Theme Settings` 面板进行调整，实时生效。

## 🛠️ 技术栈

- **React 19** — 最新版 React 框架
- **TypeScript** — 类型安全的 JavaScript 超集
- **Vite 7** — 极速构建工具
- **Tailwind CSS 4** — 实用优先的 CSS 框架
- **shadcn/ui** — New York 风格的高质量组件库
- **Recharts** — 声明式图表库
- **Cobe** — WebGL 驱动的 3D 地球
- **Motion** — 流畅的动画库
- **i18next** — 专业的国际化解决方案
- **RPC2 Protocol** — Komari 原生 RPC 协议支持

## 🚀 Quick Start

- 从 Release 下载主题 zip 包，上传到 Komari 后台即可。
- 或在 Komari 后台填写主题 URL：`https://github.com/wayjam/komari-theme-commander` 

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

Vite 开发服务器将在 `http://localhost:5173` 启动，支持 HMR 热更新。

### 构建生产版本

```bash
pnpm run build
```

构建产物输出至 `dist/` 目录，经过 TypeScript 检查和 Vite 优化。

### 打包主题

```bash
pnpm run package
```

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