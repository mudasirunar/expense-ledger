import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { Contact } from '@/domain/entities';
import { IContactRepository } from '../interfaces';

export class FirestoreContactRepository implements IContactRepository {
  private getUserContactsCollection(userId: string) {
    return collection(db, 'users', userId, 'contacts');
  }

  async getById(userId: string, id: string): Promise<Contact | null> {
    const docRef = doc(db, 'users', userId, 'contacts', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Contact;
  }

  async list(userId: string): Promise<Contact[]> {
    const q = query(this.getUserContactsCollection(userId), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Contact);
  }

  subscribe(userId: string, onUpdate: (contacts: Contact[]) => void, onError?: (error: Error) => void): () => void {
    const q = query(this.getUserContactsCollection(userId), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        onUpdate(snap.docs.map((d) => d.data() as Contact));
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async listByProject(userId: string, projectId: string): Promise<Contact[]> {
    const q = query(
      this.getUserContactsCollection(userId),
      where('associatedProjectIds', 'array-contains', projectId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Contact);
  }

  async create(userId: string, contact: Contact): Promise<void> {
    const docRef = doc(db, 'users', userId, 'contacts', contact.id);
    await setDoc(docRef, { ...contact });
  }

  async update(userId: string, id: string, partial: Partial<Contact>): Promise<void> {
    const docRef = doc(db, 'users', userId, 'contacts', id);
    await updateDoc(docRef, {
      ...partial,
      updatedAt: new Date().toISOString()
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    const docRef = doc(db, 'users', userId, 'contacts', id);
    await deleteDoc(docRef);
  }
}

