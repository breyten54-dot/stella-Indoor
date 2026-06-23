import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// Register the admin kill-switch service worker to clear any stale SWs/caches
// from previous deployments. The SW self-unregisters after clearing caches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-admin.js')
    .catch((err) => console.error('Admin SW registration failed:', err));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
