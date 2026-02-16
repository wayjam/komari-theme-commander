# Komari Theme Commander

[![license](https://img.shields.io/github/license/wayjam/komari-theme-commander)](https://github.com/wayjam/komari-theme-commander/blob/main/LICENSE)


一个基于 React、TypeScript 和 Tailwind CSS 构建的现代化 Komari 服务器监控主题。

## 特性

- 🎨 3 种精美主题（Lumina、Deepspace、Clean）
- 🌍 地球视图展示服务器全球分布
- 📊 历史数据图表（CPU、内存、负载、网络流量、延迟等）
- 🔄 WebSocket 实时数据更新
- 📈 直观的进度条和正常状态指示器（/警告/严重）
- 🏷️ 服务器分组和标签筛选
- 👁️ 网格和表格两种视图模式
- 💾 本地存储用户偏好设置（主题、视图模式）
- ⚡ 基于 React 19 + Vite 7 + Tailwind CSS 4

## 开发

### 安装依赖

```bash
cd komari-theme-commander
pnpm install
```

### 开发模式

```bash
pnpm run dev
```

### 构建生产版本

```bash
pnpm run build
```

构建完成后，`dist` 目录将包含可用于 Komari 的主题文件。

### 打包部署

```bash
pnpm run package
```

将 `komari-theme-commander.zip` 上传至 Komari 后台即可。

## 浏览器支持

支持所有现代浏览器

## License

Released under the [MIT License](https://github.com/wayjam/komari-theme-commander/blob/main/LICENSE).