import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore,
  getFirestore
} from 'firebase/firestore';
import { app, isFirebaseConfigured } from './firebaseConfig';

let firestoreInstance: Firestore;

export interface FirestoreInitResult {
  db: Firestore;
  persistenceEnabled: boolean;
  error?: string;
}

export const initFirestoreWithPersistence = (): FirestoreInitResult => {
  if (firestoreInstance) {
    return { db: firestoreInstance, persistenceEnabled: true };
  }

  if (!isFirebaseConfigured()) {
    firestoreInstance = getFirestore(app);
    return {
      db: firestoreInstance,
      persistenceEnabled: false,
      error: 'Firebase credentials are empty.'
    };
  }

  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
    return { db: firestoreInstance, persistenceEnabled: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Firestore] Multi-tab persistent local cache initialization fallback:', message);
    firestoreInstance = getFirestore(app);
    return {
      db: firestoreInstance,
      persistenceEnabled: false,
      error: message
    };
  }
};

export const { db, persistenceEnabled } = initFirestoreWithPersistence();

