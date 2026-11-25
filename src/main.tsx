import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './data/store'
import { ToastProvider } from './components/toast'
import './index.css'

// HashRouter: works inside the Capacitor WebView without server rewrites.
// MemoryRouter: for sandboxed web previews where the URL hash can't be used.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : HashRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <StoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StoreProvider>
    </Router>
  </React.StrictMode>,
)
