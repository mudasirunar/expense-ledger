import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth, googleAuthProvider, isFirebaseConfigured } from '@/data/firebase/firebaseConfig';
import { Button } from 'glisse';

const TwoToneSpinner: React.FC<{ className?: string }> = ({ className = "w-5 h-5 md:w-5.5 md:h-5.5" }) => (
  <svg
    className={`animate-spin ${className} flex-shrink-0`}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Muted circular background track */}
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="2.75"
      className="text-slate-300 dark:text-slate-700 opacity-60"
    />
    {/* Fully vibrant colored active arc (never dimmed) */}
    <path
      d="M12 3a9 9 0 0 1 9 9"
      stroke="#2563EB"
      strokeWidth="2.75"
      strokeLinecap="round"
      className="dark:stroke-blue-400"
    />
  </svg>
);
const GoogleIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5 md:w-5.5 md:h-5.5" }) => (
  <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

const LedgerIcon: React.FC<{ 
  className?: string; 
  variant?: 'default' | 'gold';
}> = ({
  className = "w-16 h-16 text-blue-600 dark:text-blue-500",
  variant = 'default',
}) => {
  if (variant === 'gold') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter: 'drop-shadow(0 4px 16px rgba(217, 155, 74, 0.45)) drop-shadow(0 1px 3px rgba(0, 0, 0, 0.25))',
        }}
      >
        <defs>
          <linearGradient id="ledger-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF4D9" />
            <stop offset="25%" stopColor="#F5CE83" />
            <stop offset="55%" stopColor="#D99B4A" />
            <stop offset="85%" stopColor="#B37528" />
            <stop offset="100%" stopColor="#7E4A11" />
          </linearGradient>
          <linearGradient id="ledger-gold-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF4D9" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#B37528" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Receipt outline with metallic coin gradient & champagne reflection fill */}
        <path
          d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"
          stroke="url(#ledger-gold-gradient)"
          fill="url(#ledger-gold-fill)"
        />
        {/* Dollar symbol with vibrant gold coin gradient */}
        <path
          d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"
          stroke="url(#ledger-gold-gradient)"
          strokeWidth="2.2"
        />
        <path
          d="M12 6v12"
          stroke="url(#ledger-gold-gradient)"
          strokeWidth="2.2"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 6v12" />
    </svg>
  );
};

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  isConfigured: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('[Auth] Persistence setup warning:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      setIsSigningIn(false);
    });

    return () => unsubscribe();
  }, [configured]);

  // Auto-recovery: cleanly reset button when user closes/dismisses Google OAuth window
  useEffect(() => {
    if (!isSigningIn) return;

    let wasHidden = false;
    let returnTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
      } else if (document.visibilityState === 'visible' && wasHidden) {
        // User returned to our app after Google popup was opened and dismissed
        if (returnTimer) clearTimeout(returnTimer);
        returnTimer = setTimeout(() => {
          if (!auth.currentUser) {
            setIsSigningIn(false);
          }
        }, 1200);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Global watchdog fallback: maximum 20s if popup hangs indefinitely
    const watchdog = setTimeout(() => {
      if (!auth.currentUser) {
        setIsSigningIn(false);
      }
    }, 20000);

    return () => {
      if (returnTimer) clearTimeout(returnTimer);
      clearTimeout(watchdog);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSigningIn]);

  // Synchronize document title, HTML/body background & theme-color with sign-in screen (neutral dark, no golden color)
  useEffect(() => {
    if (configured && !user && !loading) {
      document.title = 'Sign in | Expense Ledger';
      document.documentElement.style.backgroundColor = '#0B0F19';
      document.body.style.backgroundColor = '#0B0F19';
      const meta = document.getElementById('theme-color-meta');
      if (meta) meta.setAttribute('content', '#0B0F19');
    } else {
      document.title = 'Expense Ledger';
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      const meta = document.getElementById('theme-color-meta');
      if (meta) {
        const isDark = document.documentElement.classList.contains('dark');
        meta.setAttribute('content', isDark ? '#0B0F19' : '#F8FAFC');
      }
    }

    return () => {
      document.title = 'Expense Ledger';
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, [configured, user, loading]);

  const signInWithGoogle = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setError(null);

    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      // User closed popup, cancelled, or popup was dismissed: cleanly revert button
      if (
        authErr?.code === 'auth/popup-closed-by-user' ||
        authErr?.code === 'auth/cancelled-popup-request' ||
        authErr?.code === 'auth/popup-blocked'
      ) {
        // Normal user cancellation - do not show error banner
      } else {
        setError(authErr?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOutUser = async () => {
    setError(null);
    try {
      await signOut(auth);
      setUser(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-out failed');
    }
  };

  // While determining initial auth state from Firebase local storage, display splash screen to prevent dashboard flicker
  if (configured && loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background-light dark:bg-background text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <div className="flex flex-col items-center space-y-3">
          <LedgerIcon />
        </div>
      </div>
    );
  }

  // When unauthenticated, display simple flat sign-in screen with edge-to-edge full screen background
  if (configured && !user) {
    return (
      <div 
        className="fixed inset-0 w-full h-full min-h-screen min-h-[100dvh] flex flex-col items-center justify-center bg-[#eee1d1] select-none overflow-hidden"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Layer 0: Edge-to-edge responsive WebP background */}
        <picture className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <source
            media="(min-width: 768px)"
            srcSet="/images/auth/bg-desktop.webp"
            type="image/webp"
          />
          <img
            src="/images/auth/bg-mobile.webp"
            alt=""
            aria-hidden="true"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-center"
          />
        </picture>

        {/* Layer 1: Ambient dimming overlay with tuned brightness for optimal UI contrast */}
        <div className="absolute inset-0 bg-black/[0.06] dark:bg-black/20 pointer-events-none z-0" />

        {/* Layer 2: Foreground content */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-4 md:space-y-6 max-w-sm md:max-w-md w-full px-4">
          {/* Top Expense Ledger Favicon Icon with 3D Coin Gold Gradient */}
          <div className="mb-1 md:mb-2">
            <LedgerIcon 
              variant="gold"
              className="w-20 h-20 md:w-28 md:h-28 transition-transform duration-300 hover:scale-105" 
            />
          </div>

          {/* Name of App */}
          <h1 className="text-3xl md:text-5xl font-black text-[var(--lg-foreground)] tracking-tight">
            Expense Ledger
          </h1>

          {/* Subtitle */}
          <p className="text-sm md:text-lg text-[var(--lg-muted)] font-medium">
            Sign in with Google to continue
          </p>

          {error && (
            <div className="w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs md:text-sm text-rose-600 dark:text-rose-400 mt-2">
              {error}
            </div>
          )}

          {/* Official Glisse Button: liquid glass, higher transparency, loader is 100% vibrant colored */}
          <div className="pt-3 md:pt-5 w-full flex justify-center">
            <Button
              variant="glass"
              className={`!px-6 md:!px-8 !py-2.5 md:!py-3.5 !rounded-full font-semibold shadow-lg !text-sm md:!text-base flex items-center justify-center gap-2.5 md:gap-3 !bg-white/20 hover:!bg-white/30 dark:!bg-white/10 dark:hover:!bg-white/15 !backdrop-blur-md border border-white/40 dark:border-white/20 transition-all duration-200 ${
                isSigningIn ? '!cursor-wait opacity-80' : ''
              }`}
              onClick={isSigningIn ? undefined : signInWithGoogle}
              aria-busy={isSigningIn}
              icon={isSigningIn ? <TwoToneSpinner className="w-5 h-5 md:w-5.5 md:h-5.5" /> : <GoogleIcon className="w-5 h-5 md:w-5.5 md:h-5.5" />}
            >
              <span className={isSigningIn ? 'opacity-60' : ''}>
                Sign in with Google
              </span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithGoogle,
        signOutUser,
        isConfigured: configured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
