import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './data/store'
import { ToastProvider } from './components/toast'
import './index.css'

// HashRouter: works from file:// inside the Capacitor WebView without server rewrites.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
)
