import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker with safe update lifecycle
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(
        new CustomEvent('pwa:need-refresh', {
          detail: { updateSW },
        })
      );
    },
    onOfflineReady() {
      console.log('[PWA] App shell cached. Ready for offline use.');
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
