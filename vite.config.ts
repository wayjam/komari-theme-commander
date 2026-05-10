import path from "path"
import fs from "fs"
import { defineConfig, loadEnv, type Plugin } from "vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react-swc"
import { worldCountriesFilter } from "./scripts/vite-plugin-world-countries-filter"

/**
 * 本地开发时，拦截对 /themes/Commander/komari-theme.json 的请求，
 * 返回项目根目录下的 komari-theme.json，方便调试主题配置。
 */
function localKomariThemePlugin(): Plugin {
  const themeRequestPath = "/themes/Commander/komari-theme.json"
  const localThemeFile = path.resolve(__dirname, "komari-theme.json")

  return {
    name: "local-komari-theme",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()

        const url = new URL(req.url, "http://localhost")
        if (!url.pathname.endsWith(themeRequestPath)) return next()

        fs.readFile(localThemeFile, (err, data) => {
          if (err) {
            res.statusCode = 404
            res.setHeader("Content-Type", "application/json; charset=utf-8")
            res.end(JSON.stringify({ error: "Local theme file not found", file: localThemeFile }))
            return
          }
          res.statusCode = 200
          res.setHeader("Content-Type", "application/json; charset=utf-8")
          res.setHeader("Cache-Control", "no-store")
          res.end(data)
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")
  const apiTarget = (env.VITE_API_TARGET || "http://127.0.0.1:25774").trim()

  return {
    plugins: [
      localKomariThemePlugin(),
      // Strip the unused fields from `world-countries` so the globe chunk only
      // ships what we actually read at runtime. Mode `"merge"` = auto-detect
      // referenced fields + the explicit `fields` list below. To pin extra
      // fields without touching code, append them here; to opt out of the
      // scanner entirely, switch to `mode: "manual"`.
      worldCountriesFilter({
        mode: "merge",
        fields: ["flag", "latlng"],
      }),
      tailwindcss(),
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ["recharts"],
            globe: ["cobe", "world-countries"],
            ui: ["motion", "sonner"],
          },
          chunkFileNames: "assets/chunk-[name]-[hash].js",
          entryFileNames: "assets/entry-[name]-[hash].js",
        },
      },
    },

    // 开发模式下，代理 /api 和 /themes 到 Komari 后端
    ...(mode === "development"
      ? {
          server: {
            // 多项目并行开发时避免都抢 5173：本仓库默认 5174，可用 VITE_DEV_SERVER_PORT 覆盖
            port: Number.parseInt(env.VITE_DEV_SERVER_PORT || "5174", 10),
            strictPort: false,
            proxy: {
              "/api": {
                target: apiTarget,
                changeOrigin: true,
                rewriteWsOrigin: true,
                ws: true, // WebSocket 代理（/api/clients）
                secure: false, // 允许代理到 HTTPS（含自签名证书）
              },
              "/themes": {
                target: apiTarget,
                changeOrigin: true,
                secure: false,
              },
            },
          },
        }
      : {}),
  }
})
