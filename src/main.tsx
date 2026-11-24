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

// iOS WebKit Standalone PWA recovery: after the software keyboard finishes closing,
// WebKit can leave window.scrollY > 0 or a shrunken fixed-position viewport (~34-44px bottom gap).
// This does nothing while the keyboard is open and only snaps the viewport back cleanly on close.
if (typeof window !== 'undefined') {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    const isEditable = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
    };

    const recoverIOSViewport = () => {
      if (isEditable(document.activeElement)) return;

      const html = document.documentElement;
      const body = document.body;
      const wasModalOpen = body.classList.contains('modal-open');

      // Temporarily allow root scroll reset if a modal locked overflow: hidden
      const prevHtmlOverflow = html.style.overflow;
      const prevBodyOverflow = body.style.overflow;
      if (wasModalOpen) {
        html.style.overflow = '';
        body.style.overflow = '';
      }

      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }

      // Synchronous zero-flicker reflow so WebKit recalculates standalone fixed-position bounds
      html.style.minHeight = 'calc(100lvh + 0.5px)';
      void html.offsetHeight;
      html.style.minHeight = '';

      if (wasModalOpen) {
        html.style.overflow = prevHtmlOverflow;
        body.style.overflow = prevBodyOverflow;
      }
    };

    let t1: number | undefined;
    let t2: number | undefined;
    const scheduleRecovery = () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      t1 = window.setTimeout(recoverIOSViewport, 120);
      t2 = window.setTimeout(recoverIOSViewport, 350);
    };

    // Native-style keyboard focus for modals: stop iOS from panning the whole page to reveal
    // the focused text field (background stays static). The modal itself re-centers above the
    // keyboard via the --kb CSS variable below.
    const TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''];
    document.addEventListener(
      'touchstart',
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target || target.tagName !== 'INPUT') return;
        if (!target.closest('.fixed.z-50')) return;
        const input = target as HTMLInputElement;
        if (!TEXT_TYPES.includes(input.type) || input.disabled || input.readOnly) return;
        if (document.activeElement === input) return;
        e.preventDefault();
        input.focus({ preventScroll: true });
      },
      { passive: false }
    );

    // Publish the on-screen keyboard height so modal overlays can center in the visible area only
    const updateKeyboardOffset = () => {
      const vv = window.visualViewport;
      const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      document.documentElement.style.setProperty('--kb', `${kb > 80 ? kb : 0}px`);
    };
    window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);

    document.addEventListener('focusout', (e) => {
      if (isEditable(e.target as Element | null)) {
        scheduleRecovery();
      }
    });

    if (window.visualViewport) {
      let prevHeight = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', () => {
        const nextHeight = window.visualViewport?.height ?? prevHeight;
        if (nextHeight > prevHeight + 50 && !isEditable(document.activeElement)) {
          scheduleRecovery();
        }
        prevHeight = nextHeight;
      });
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
