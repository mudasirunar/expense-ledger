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
  QueryConstraint
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { Obligation } from '@/domain/entities';
import { IObligationRepository, ObligationFilter } from '../interfaces';

export class FirestoreObligationRepository implements IObligationRepository {
  private getUserObligationsCollection(userId: string) {
    return collection(db, 'users', userId, 'obligations');
  }

  async getById(userId: string, id: string): Promise<Obligation | null> {
    const docRef = doc(db, 'users', userId, 'obligations', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Obligation;
  }

  async list(userId: string, filter?: ObligationFilter): Promise<Obligation[]> {
    const constraints: QueryConstraint[] = [];

    if (filter?.projectId) {
      constraints.push(where('projectId', '==', filter.projectId));
    }
    if (filter?.contactId) {
      constraints.push(where('contactId', '==', filter.contactId));
    }
    if (filter?.status) {
      constraints.push(where('status', '==', filter.status));
    }

    constraints.push(orderBy('date', 'desc'));

    const q = query(this.getUserObligationsCollection(userId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Obligation);
  }

  async create(userId: string, obligation: Obligation): Promise<void> {
    const docRef = doc(db, 'users', userId, 'obligations', obligation.id);
    await setDoc(docRef, { ...obligation });
  }

  async update(userId: string, id: string, partial: Partial<Obligation>): Promise<void> {
    const docRef = doc(db, 'users', userId, 'obligations', id);
    await updateDoc(docRef, {
      ...partial,
      updatedAt: new Date().toISOString()
    });
  }

  async void(userId: string, id: string): Promise<void> {
    const docRef = doc(db, 'users', userId, 'obligations', id);
    await updateDoc(docRef, {
      status: 'voided',
      updatedAt: new Date().toISOString()
    });
  }
}

