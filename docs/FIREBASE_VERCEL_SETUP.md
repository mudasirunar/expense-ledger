# Firebase & Vercel Setup Guide and Free-Tier Discipline

## 1. Firebase Project Setup

### 1.1 Project Initialization
1. Visit the [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g., `haris-ledger-pwa`).
2. Google Analytics can remain disabled as external tracking is excluded from this project.
3. Register a Web App:
   * Go to **Project Settings $\rightarrow$ General $\rightarrow$ Your apps**.
   * Click the Web icon (`</>`), name the app, and copy the `firebaseConfig` object.

### 1.2 Firebase Authentication (Google Provider)
1. In Firebase Console, navigate to **Build $\rightarrow$ Authentication $\rightarrow$ Sign-in method**.
2. Click **Add new provider** and select **Google**.
3. Enable Google Sign-In and specify the project support email.
4. Under **Authorized Domains**, add:
   * `localhost`
   * `127.0.0.1`
   * `<your-vercel-deployment>.vercel.app`

### 1.3 Cloud Firestore Database
1. In Firebase Console, navigate to **Build $\rightarrow$ Firestore Database**.
2. Click **Create Database**.
3. Choose a location closest to the primary user (e.g., `asia-south1` or `eur3`).
4. Start in **Production Mode** (default deny all).
5. Deploy the security rules from `docs/AUTH_SECURITY.md` or `firestore.rules`.

---

## 2. Environment Variables Boundary

Never hardcode Firebase credentials directly in application source files. Use Vite environment variables prefixed with `VITE_`.

### `.env.example`
```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"

# Application Settings
VITE_APP_DEFAULT_CURRENCY="PKR"
VITE_APP_ENV="production"
```

---

## 3. Vercel Hosting Configuration

### 3.1 Single Page Application (SPA) Rewrites
To ensure deep links and page refreshes work smoothly without 404 errors, create a `vercel.json` file in the project root:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/manifest+json"
        }
      ]
    }
  ]
}
```

---

## 4. Free-Tier Cost Discipline & Quota Management

Cloud Firestore's free tier (Spark plan) is generous for a single user or small team:

| Resource | Free Daily Quota | Application Optimization Strategy |
| :--- | :--- | :--- |
| **Document Reads** | 50,000 reads / day | Heavy local IndexedDB persistent caching; real-time listeners receive only document diffs. |
| **Document Writes** | 20,000 writes / day | Client-side debouncing; batch allocations; avoided duplicate retries via idempotency keys. |
| **Document Deletes** | 20,000 deletes / day | Voids are flag updates, not deletes. |
| **Storage Stored** | 1 GiB total | Compact JSON documents, normalized minor currency integers, no large blobs or raw base64 images. |
| **Network Egress** | 10 GiB / month | Service Worker serves all app-shell static assets locally. |

### Quota Safety Alerts:
* Set up a **Budget & Alert** in Google Cloud Console at \$1.00 to guarantee early email warnings if unexpected traffic occurs.
