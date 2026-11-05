# Offline PWA, Persistent Storage & Synchronization Architecture

## 1. Separation of the Three Storage Pillars

A critical architectural distinction must be maintained between three independent mechanisms:

1. **Cached Application Shell (Service Worker / Cache Storage):**
   * Stores static frontend assets: compiled HTML, JavaScript bundles, CSS stylesheets, web fonts, and PWA icon manifests.
   * Ensures the app UI boots instantly without network connectivity.
2. **Firestore Persistent Data Cache (IndexedDB):**
   * Stores localized document data, queries, and pending writes via Firebase SDK `persistentLocalCache`.
   * Enables immediate reads of previously loaded data and enqueues offline writes.
3. **User-Controlled Export / Backup (JSON & CSV):**
   * Explicit, downloadable files exported to local device storage or iCloud Drive.
   * Protects against device loss, browser cache purges, or IndexedDB quota evictions.

---

## 2. Firestore Persistent Cache Initialization

Using the modern modular Firebase v10/v11 SDK, Firestore is initialized with explicit multi-tab IndexedDB cache persistence:

```typescript
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { app } from './firebaseApp';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
```

### Unsupported Browsers & Fallback:
If IndexedDB is disabled (e.g., strictly restricted Private Browsing mode on certain older browsers), initialization catches the error and falls back gracefully to in-memory persistence with a persistent UI warning that data will not survive page reloads.

---

## 3. Offline Write Pipeline & Pending Sync Indicator

### 3.1 Idempotency Keys
Every financial creation command generates a client-side UUID v4 `idempotencyKey` stored inside the document:
* Prevents duplicate record creation if the user retries a write while network reconnects.
* Cloud Firestore write queues reconcile cleanly with the remote database once connection is established.

### 3.2 Pending Synchronization State
* The application monitors Firestore metadata via snapshot listeners:
  * `snapshot.metadata.hasPendingWrites`: Indicates local changes haven't been committed to the server.
  * `snapshot.metadata.fromCache`: Indicates data is served from local IndexedDB rather than the server.
* The UI header displays a persistent, unobtrusive status pill:
  * 🟢 **Synced:** All records synchronized with Cloud Firestore.
  * 🟠 **Pending Sync (N):** N local changes waiting for internet connection.
  * 🔴 **Offline:** Device disconnected from network.

### 3.3 Offline Query Boundary & Search Honesty
* **Crucial Rule:** Firestore offline queries can **only filter across documents that have already been read and cached** into local IndexedDB.
* The application will never falsely claim that a full historical search was exhaustive when executed offline. Search results will display:
  > *"Viewing results from local cache. Connect to the internet to search historical records not cached on this device."*

---

## 4. Dedicated Pull-to-Refresh Gesture Specification

Mobile pull-to-refresh must be smooth and native-feeling without interfering with browser gestures:

### Technical Constraints:
1. **Container Scroll Top Boundary:** The pull action activates **only** when `scrollTop === 0` on the active scroll container.
2. **Downward Threshold:** Requires a minimum deliberate pull distance of **70px** to trigger.
3. **Edge-Swipe Protection:** Does not hijack horizontal touch events, preserving iOS Safari's native edge-swipe back navigation.
4. **Visual Feedback:**
   * Downward drag rotates a pull arrow indicator.
   * Reaching the threshold triggers a spinner and subtle haptic feedback (where supported).
   * Displays "Updating..." during listener synchronization.
   * Displays "Up to date" on completion.
5. **No Blind Full-Page Reloads:** Pull-to-refresh does **not** call `window.location.reload()`. It forces active Firestore queries to fetch from the server (`getDocsFromServer`) or resets snapshot listeners to reconcile server state.
6. **Accessible Alternative:** A standard refresh icon button is provided in the page header for keyboard and screen-reader users.
7. **Reduced Motion:** When `prefers-reduced-motion: reduce` is enabled, smooth transitions are replaced with immediate state updates.

---

## 5. PWA Installation & iOS Safari Lifecycle

### 5.1 iPhone Safari PWA Installation
iOS Safari does not support the Android `beforeinstallprompt` event. Clear, guided in-app modal instructions are provided:
1. Tap the **Share** button (box with upward arrow) in the Safari toolbar.
2. Scroll down and tap **Add to Home Screen**.
3. Tap **Add** in the top right corner.

### 5.2 Standalone Display Mode & Safe Area Insets
The PWA manifest configures `display: "standalone"`, `orientation: "portrait-primary"`.
The viewport meta tag includes `viewport-fit=cover` to allow full edge-to-edge rendering around the iPhone notch/dynamic island and home indicator bar:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
```
Styles strictly use CSS environment variables:
* `padding-top: env(safe-area-inset-top);`
* `padding-bottom: env(safe-area-inset-bottom);`

---

## 6. Service Worker Caching & Update Lifecycle

* Built using `vite-plugin-pwa` with Workbox.
* **Pre-cached Assets:** Main JS chunk, CSS, HTML, web manifest, static SVG icons.
* **Update Strategy:** `stale-while-revalidate` for application shell.
* When a new version is detected, the app displays a non-intrusive banner: *"New version available. [Update Now]"*. Clicking the button posts a `SKIP_WAITING` message to the service worker and reloads to the latest build cleanly.
