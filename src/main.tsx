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
  const KEYBOARD_TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''];

  const isKeyboardTextField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement => {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') {
      const ta = el as HTMLTextAreaElement;
      return !ta.disabled && !ta.readOnly;
    }
    if (el.tagName === 'INPUT') {
      const inp = el as HTMLInputElement;
      return KEYBOARD_TEXT_TYPES.includes(inp.type) && !inp.disabled && !inp.readOnly;
    }
    return false;
  };

  const getNextModalControl = (el: HTMLElement): HTMLElement | null => {
    const backdrop = el.closest('.fixed.z-50:not([data-bottom-sheet="true"])') as HTMLElement | null;
    const modalCard = backdrop?.firstElementChild as HTMLElement | null;
    if (!modalCard || !modalCard.contains(el)) return null;

    const controls = Array.from(
      modalCard.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
      )
    ).filter((node) => node.offsetParent !== null);

    const idx = controls.indexOf(el);
    if (idx < 0 || idx + 1 >= controls.length) return null;
    return controls[idx + 1];
  };

  // Dynamically set native keyboard action key ("next" when immediately followed by another
  // keyboard text field; "done" when last field or followed by a non-keyboard control like select/date)
  const syncModalEnterKeyHint = (el: HTMLElement | null) => {
    if (!isKeyboardTextField(el)) return;
    if (!el.closest('.fixed.z-50:not([data-bottom-sheet="true"])')) return;
    const nextControl = getNextModalControl(el);
    el.enterKeyHint = isKeyboardTextField(nextControl) ? 'next' : 'done';
  };

  document.addEventListener('focusin', (e) => {
    syncModalEnterKeyHint(e.target as HTMLElement | null);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (!isKeyboardTextField(target)) return;
    // Allow normal newlines in multiline textareas
    if (target.tagName === 'TEXTAREA') return;
    if (!target.closest('.fixed.z-50:not([data-bottom-sheet="true"])')) return;

    // Never auto-submit modal forms from the keyboard action key
    e.preventDefault();

    const nextControl = getNextModalControl(target);
    if (isKeyboardTextField(nextControl)) {
      syncModalEnterKeyHint(nextControl);
      try {
        nextControl.focus({ preventScroll: true });
      } catch {
        nextControl.focus();
      }
    } else {
      // Next element is non-keyboard (select/date) or this is the last field -> close keyboard
      target.blur();
    }
  });

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
        if (!target.closest('.fixed.z-50, [data-prevent-ios-pan="true"]')) return;
        const input = target as HTMLInputElement;
        if (!TEXT_TYPES.includes(input.type) || input.disabled || input.readOnly) return;
        if (document.activeElement === input) return;
        syncModalEnterKeyHint(input);
        e.preventDefault();
        input.focus({ preventScroll: true });
      },
      { passive: false }
    );

    // Keep focused inputs inside tall modals visible by adjusting ONLY the modal card's own
    // scrollTop (never calling scrollIntoView, which pans iOS WebKit's visualViewport).
    let scrollFieldTimer: number | undefined;
    const ensureModalFieldVisible = (el: HTMLElement | null) => {
      if (!el) return;
      const backdrop = el.closest('.fixed.z-50:not([data-bottom-sheet="true"])') as HTMLElement | null;
      const modalCard = backdrop?.firstElementChild as HTMLElement | null;
      if (!modalCard || !modalCard.contains(el)) return;

      window.clearTimeout(scrollFieldTimer);
      const adjustScroll = () => {
        if (document.activeElement !== el) return;

        // If this is the last visible text field in the modal, scroll all the way to the
        // bottom so the Cancel / Submit action buttons below it stay clearly visible.
        const visibleTextFields = Array.from(
          modalCard.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea:not([disabled])'
          )
        ).filter((node) => node.offsetParent !== null);
        const isLastTextField =
          visibleTextFields.length > 0 &&
          visibleTextFields[visibleTextFields.length - 1] === el;

        if (isLastTextField) {
          modalCard.scrollTop = modalCard.scrollHeight;
          return;
        }

        const cardRect = modalCard.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const pad = 20;

        if (elRect.bottom > cardRect.bottom - pad) {
          modalCard.scrollTop += elRect.bottom - (cardRect.bottom - pad);
        } else if (elRect.top < cardRect.top + pad) {
          modalCard.scrollTop -= cardRect.top + pad - elRect.top;
        }
      };

      requestAnimationFrame(adjustScroll);
      scrollFieldTimer = window.setTimeout(adjustScroll, 120);
    };

    // Publish the on-screen keyboard height so modal overlays can center in the visible area only
    const updateKeyboardOffset = () => {
      const vv = window.visualViewport;
      const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      document.documentElement.style.setProperty('--kb', `${kb > 80 ? kb : 0}px`);

      if (kb > 80) {
        ensureModalFieldVisible(document.activeElement as HTMLElement | null);
      }
    };
    window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);

    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement | null;
      if (isEditable(target)) {
        ensureModalFieldVisible(target);
      }
    });

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
