# Authentication & Security Architecture

## 1. Firebase Authentication & Google Sign-In on Vercel

The application exclusively uses Firebase Authentication with Google Sign-In.

### 1.1 Dual Auth Strategy (Popup with Redirect Fallback)
Mobile browsers and standalone PWAs behave differently regarding OAuth popups:
* **Desktop & Standard Safari:** Tries `signInWithPopup(auth, googleProvider)`.
* **Popup Blocked or iOS Standalone PWA:** If popup opening is blocked or rejected by the browser security sandbox, the application falls back gracefully to `signInWithRedirect(auth, googleProvider)`.
* **Return Handling:** At the application root, `getRedirectResult(auth)` is checked during initial boot before rendering protected views.

### 1.2 Route Restoration
When a user attempts to access a protected route (e.g., `/projects/house-construction/add-expense`) while unauthenticated:
1. The target internal path is stored in `sessionStorage` under `post_login_redirect_path`.
2. The user is redirected to the sign-in screen.
3. Upon successful authentication (either via popup or redirect return), the app reads the stored path, clears the key, and navigates to the intended destination.
4. **Security Rule:** The redirect path is strictly validated to be an internal relative path (must start with `/` and not `//` or `http`) to prevent Open Redirect vulnerabilities.

### 1.3 Vercel Authorized Domains Configuration
For Google Sign-In to function on Vercel, the production and preview domains must be explicitly authorized in the Firebase Console:
* Navigate to: **Firebase Console $\rightarrow$ Authentication $\rightarrow$ Settings $\rightarrow$ Authorized Domains**.
* Add:
  * `localhost`
  * `127.0.0.1`
  * `<project-name>.vercel.app`
  * Custom domain (if configured).

---

## 2. Cloud Firestore Security Rules

To enforce strict multi-tenant isolation, Firestore rules prevent any authenticated user from reading or writing documents outside their own `users/{uid}` path.

### Authoritative `firestore.rules`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Deny access to any un-scoped root collections
    match /{document=**} {
      allow read, write: if false;
    }

    // Only the authenticated owner can read and write their own data
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 3. Client-Side Financial Trust & Threat Modeling

### 3.1 Transparent Architectural Limitations
Because this system is built as a pure frontend PWA without server-side Cloud Functions:
* **Single-User Security Boundary:** The user owns their data. Firestore rules ensure User A cannot inspect or modify User B's accounts.
* **Client-Only Trust:** An adversarial user with browser DevTools could hypothetically modify their local JavaScript memory to write a mismatched balance.
* **Mitigation:** The application includes client-side domain integrity checkers that recompute ledger balances from source events and flag any local inconsistencies.

### 3.2 Data Privacy & Production Logging
* Production builds disable verbose console logging of private monetary amounts, contact phone numbers, or account details.
* Sensitive error objects are sanitized before being surfaced in UI error boundaries.
