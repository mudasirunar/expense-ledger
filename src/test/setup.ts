import '@testing-library/jest-dom';

// Polyfill window.matchMedia for JSDOM
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Polyfill global matchMedia (for functions calling matchMedia without window prefix)
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = window.matchMedia;

  // Polyfill ResizeObserver for JSDOM
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverMock;
  globalThis.ResizeObserver = ResizeObserverMock;
}
