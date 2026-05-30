import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './i18n'
import './index.css'
import { ThemeProvider } from './hooks/useTheme'
import { AppConfigProvider } from './hooks/useAppConfig'
import { PrivacyModeProvider } from './hooks/usePrivacyMode'
import { TooltipProvider } from './components/ui/tooltip'
import { registerPwa } from './lib/pwa'
import App from './App.tsx'

// Register the PWA service worker (idempotent, safe to call before render).
// Wrapped in a microtask so it never blocks React's first paint.
queueMicrotask(registerPwa)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AppConfigProvider>
          <PrivacyModeProvider>
            <TooltipProvider>
              <App />
              {/*
                Sonner toaster — used by registerPwa() for "new version
                available / offline ready" prompts and (later) by offline
                cache fallbacks. `richColors` matches the HUD aesthetic;
                offset accounts for the sticky footer so toasts don't sit
                on top of the WebSocket status bar.
              */}
              <Toaster
                position="bottom-right"
                richColors
                closeButton
                offset={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 3rem)' }}
                toastOptions={{
                  classNames: {
                    toast: 'font-mono',
                  },
                }}
              />
            </TooltipProvider>
          </PrivacyModeProvider>
        </AppConfigProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
