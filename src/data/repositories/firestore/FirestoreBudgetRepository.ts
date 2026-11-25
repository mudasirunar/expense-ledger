import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  orderBy,
  query,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { CategoryBudget } from '@/domain/entities';
import { IBudgetRepository } from '../interfaces';
import {
  isRecordActive,
  sanitizeUpdatePayload,
  hardDeleteWithRegistry,
  stripUndefinedFields,
} from '@/data/sync/dataWipeService';

export class FirestoreBudgetRepository implements IBudgetRepository {
  private getUserBudgetsCollection(userId: string) {
    return collection(db, 'users', userId, 'budgets');
  }

  async getById(userId: string, id: string): Promise<CategoryBudget | null> {
    const docRef = doc(db, 'users', userId, 'budgets', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as CategoryBudget;
    return isRecordActive(userId, data) ? data : null;
  }

  async list(userId: string): Promise<CategoryBudget[]> {
    const q = query(this.getUserBudgetsCollection(userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as CategoryBudget)
      .filter((item) => isRecordActive(userId, item));
  }

  subscribe(
    userId: string,
    onUpdate: (budgets: CategoryBudget[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const q = query(this.getUserBudgetsCollection(userId), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        onUpdate(
          snap.docs
            .map((d) => d.data() as CategoryBudget)
            .filter((item) => isRecordActive(userId, item))
        );
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async create(userId: string, budget: CategoryBudget): Promise<void> {
    const docRef = doc(db, 'users', userId, 'budgets', budget.id);
    await setDoc(docRef, stripUndefinedFields({ ...budget, isDeleted: false }));
  }

  async update(userId: string, id: string, partial: Partial<CategoryBudget>): Promise<void> {
    const docRef = doc(db, 'users', userId, 'budgets', id);
    await updateDoc(docRef, {
      ...sanitizeUpdatePayload(partial),
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    let name = 'Budget';
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'budgets', id));
      if (snap.exists()) {
        const data = snap.data() as Partial<CategoryBudget>;
        if (data.categoryLabel) name = data.categoryLabel;
      }
    } catch {
      // Fallback to default label if offline & uncached
    }
    await hardDeleteWithRegistry(userId, 'budgets', id, name);
  }
}
