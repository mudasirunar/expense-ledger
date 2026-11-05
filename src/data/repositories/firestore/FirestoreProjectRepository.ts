import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  orderBy,
  query
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { Project } from '@/domain/entities';
import { IProjectRepository } from '../interfaces';

export class FirestoreProjectRepository implements IProjectRepository {
  private getUserProjectsCollection(userId: string) {
    return collection(db, 'users', userId, 'projects');
  }

  async getById(userId: string, id: string): Promise<Project | null> {
    const docRef = doc(db, 'users', userId, 'projects', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Project;
  }

  async list(userId: string): Promise<Project[]> {
    const q = query(this.getUserProjectsCollection(userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Project);
  }

  async create(userId: string, project: Project): Promise<void> {
    const docRef = doc(db, 'users', userId, 'projects', project.id);
    await setDoc(docRef, { ...project });
  }

  async update(userId: string, id: string, partial: Partial<Project>): Promise<void> {
    const docRef = doc(db, 'users', userId, 'projects', id);
    await updateDoc(docRef, {
      ...partial,
      updatedAt: new Date().toISOString()
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    const docRef = doc(db, 'users', userId, 'projects', id);
    await deleteDoc(docRef);
  }
}

