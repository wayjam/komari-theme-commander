// PWA registration + update prompts.
//
// Why prompt-style instead of registerType "autoUpdate":
//   • autoUpdate silently swaps the app on the next navigation. For a live
//     monitoring dashboard that can mean a chart in mid-render disappearing
//     under the user. Surfacing the new build through a sonner toast lets
//     the user pick when to reload.
//   • The Service Worker scope is "/", which (since this is a *theme*) sits
//     above pages we don't control (`/admin`, `/terminal`) and the live
//     `/api/*` data channel. Those are denylisted in the workbox config —
//     this module only handles the in-app update surface.
//
// Idempotent: calling registerPwa() more than once is a no-op so React
// StrictMode double-mount in dev cannot register the SW twice.
import { toast } from "sonner"
import i18n from "../i18n"

let registered = false
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean
}

function isInstalledPwaWindow(): boolean {
  if (typeof window === "undefined") return false

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  )
}

function isThemeServiceWorker(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing
  if (!worker) return false

  try {
    return new URL(worker.scriptURL).pathname === "/sw.js"
  } catch {
    return false
  }
}

async function unregisterBrowserTabServiceWorker(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/")
    if (!registration || !isThemeServiceWorker(registration)) return

    await registration.unregister()
  } catch (error) {
    console.warn("[pwa] browser-tab sw cleanup failed", error)
  }
}

function t(key: string, fallback: string, vars?: Record<string, string>): string {
  // i18n is bootstrapped synchronously in src/i18n.ts (top-level await), so
  // by the time main.tsx mounts the React tree the resources are already
  // loaded. Falling back to the English literal keeps us safe if a key is
  // missing in a language pack.
  const value = i18n.t(key, { defaultValue: fallback, ...vars })
  return typeof value === "string" ? value : fallback
}

export function registerPwa(): void {
  if (registered) return
  registered = true
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return

  // Komari Theme Commander is served at "/", so its SW scope is also "/".
  // Keep that behavior reserved for installed PWA windows; ordinary desktop
  // browser tabs should behave like the live Komari web UI, without update
  // prompts or a theme-level service worker controlling the site root.
  if (!isInstalledPwaWindow()) {
    void unregisterBrowserTabServiceWorker()
    return
  }

  // Lazy-load to keep the PWA runtime out of the critical entry chunk for
  // browsers that won't end up using it (older mobile / private browsing).
  void import("virtual:pwa-register").then(({ registerSW }) => {
    updateSW = registerSW({
      // Poll for an updated SW once an hour while the tab is open. The
      // dashboard is often left running on a wallboard for days; without
      // this poll the only way to pick up a new theme build is a hard
      // reload.
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        const oneHour = 60 * 60 * 1000
        setInterval(() => {
          if (document.visibilityState === "visible") {
            void registration.update().catch((err) => {
              console.warn("[pwa] sw update poll failed", err)
            })
          }
        }, oneHour)
      },
      onNeedRefresh() {
        toast(t("pwa.updateAvailable", "New version available"), {
          description: t("pwa.updateBody", "Reload to switch to the latest build."),
          duration: Number.POSITIVE_INFINITY,
          // sonner ≥ 2.0 dismisses on action click by default.
          action: {
            label: t("pwa.updateAction", "Reload"),
            onClick: () => {
              void updateSW?.(true)
            },
          },
          cancel: {
            label: t("pwa.later", "Later"),
            // Sonner requires onClick; explicit no-op closes the toast.
            onClick: () => {},
          },
        })
      },
      onOfflineReady() {
        toast.success(t("pwa.offlineReady", "Ready to work offline"), {
          description: t("pwa.offlineReadyBody", "The app shell is cached on this device."),
          duration: 4000,
        })
      },
      onRegisterError(error) {
        // Don't surface this to the user — failing to register the SW
        // simply means they don't get offline support, the app still works.
        console.warn("[pwa] register failed", error)
      },
    })
  }).catch((err) => {
    console.warn("[pwa] virtual:pwa-register import failed", err)
  })
}
