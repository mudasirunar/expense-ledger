import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { Account } from '@/domain/entities';
import { IAccountRepository } from '../interfaces';

export class FirestoreAccountRepository implements IAccountRepository {
  private getUserAccountsCollection(userId: string) {
    return collection(db, 'users', userId, 'accounts');
  }

  async getById(userId: string, id: string): Promise<Account | null> {
    const docRef = doc(db, 'users', userId, 'accounts', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Account;
  }

  async list(userId: string): Promise<Account[]> {
    const q = query(this.getUserAccountsCollection(userId), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Account);
  }

  subscribe(userId: string, onUpdate: (accounts: Account[]) => void, onError?: (error: Error) => void): () => void {
    const q = query(this.getUserAccountsCollection(userId), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        onUpdate(snap.docs.map((d) => d.data() as Account));
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async create(userId: string, account: Account): Promise<void> {
    const docRef = doc(db, 'users', userId, 'accounts', account.id);
    await setDoc(docRef, { ...account });
  }

  async update(userId: string, id: string, partial: Partial<Account>): Promise<void> {
    const docRef = doc(db, 'users', userId, 'accounts', id);
    await updateDoc(docRef, {
      ...partial,
      updatedAt: new Date().toISOString()
    });
  }

  async updateBalance(userId: string, id: string, newBalanceMinor: number): Promise<void> {
    const docRef = doc(db, 'users', userId, 'accounts', id);
    await updateDoc(docRef, {
      currentBalanceMinor: newBalanceMinor,
      updatedAt: new Date().toISOString()
    });
  }
}

