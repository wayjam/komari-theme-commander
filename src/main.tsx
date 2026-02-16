import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n'
import './index.css'
import { ThemeProvider } from './hooks/useTheme'
import { AppConfigProvider } from './hooks/useAppConfig'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AppConfigProvider>
          <App />
        </AppConfigProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
