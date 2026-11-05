import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query,
  where,
  orderBy,
  onSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { Transaction } from '@/domain/entities';
import { ITransactionRepository, TransactionFilter } from '../interfaces';

export class FirestoreTransactionRepository implements ITransactionRepository {
  private getUserTransactionsCollection(userId: string) {
    return collection(db, 'users', userId, 'transactions');
  }

  async getById(userId: string, id: string): Promise<Transaction | null> {
    const docRef = doc(db, 'users', userId, 'transactions', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Transaction;
  }

  async list(userId: string, filter?: TransactionFilter): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [];

    if (filter?.projectId) {
      constraints.push(where('projectId', '==', filter.projectId));
    }
    if (filter?.accountId) {
      constraints.push(where('accountId', '==', filter.accountId));
    }
    if (filter?.scope) {
      constraints.push(where('scope', '==', filter.scope));
    }
    if (filter?.startDate) {
      constraints.push(where('date', '>=', filter.startDate));
    }
    if (filter?.endDate) {
      constraints.push(where('date', '<=', filter.endDate));
    }

    // Default chronological ordering
    constraints.push(orderBy('date', 'desc'));

    const q = query(this.getUserTransactionsCollection(userId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Transaction);
  }

  subscribe(userId: string, onUpdate: (transactions: Transaction[]) => void, onError?: (error: Error) => void): () => void {
    const q = query(this.getUserTransactionsCollection(userId), orderBy('date', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        onUpdate(snap.docs.map((d) => d.data() as Transaction));
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async create(userId: string, transaction: Transaction): Promise<void> {
    const docRef = doc(db, 'users', userId, 'transactions', transaction.id);
    await setDoc(docRef, { ...transaction });
  }

  async void(userId: string, id: string): Promise<void> {
    const docRef = doc(db, 'users', userId, 'transactions', id);
    await updateDoc(docRef, {
      status: 'voided',
      updatedAt: new Date().toISOString()
    });
  }
}

