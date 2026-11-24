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
import { Project } from '@/domain/entities';
import { IProjectRepository } from '../interfaces';
import {
  isRecordActive,
  sanitizeUpdatePayload,
  hardDeleteWithRegistry,
  stripUndefinedFields,
} from '@/data/sync/dataWipeService';

export class FirestoreProjectRepository implements IProjectRepository {
  private getUserProjectsCollection(userId: string) {
    return collection(db, 'users', userId, 'projects');
  }

  async getById(userId: string, id: string): Promise<Project | null> {
    const docRef = doc(db, 'users', userId, 'projects', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Project;
    return isRecordActive(userId, data) ? data : null;
  }

  async list(userId: string): Promise<Project[]> {
    const q = query(this.getUserProjectsCollection(userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Project)
      .filter((item) => isRecordActive(userId, item));
  }

  subscribe(
    userId: string,
    onUpdate: (projects: Project[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const q = query(this.getUserProjectsCollection(userId), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        onUpdate(
          snap.docs
            .map((d) => d.data() as Project)
            .filter((item) => isRecordActive(userId, item))
        );
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  }

  async create(userId: string, project: Project): Promise<void> {
    const docRef = doc(db, 'users', userId, 'projects', project.id);
    await setDoc(docRef, stripUndefinedFields({ ...project, isDeleted: false }));
  }

  async update(userId: string, id: string, partial: Partial<Project>): Promise<void> {
    const docRef = doc(db, 'users', userId, 'projects', id);
    await updateDoc(docRef, {
      ...sanitizeUpdatePayload(partial),
      updatedAt: new Date().toISOString(),
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    let name = 'Project';
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'projects', id));
      if (snap.exists()) {
        const data = snap.data() as Partial<Project>;
        if (data.name) name = data.name;
      }
    } catch {
      // Fallback to default label if offline & uncached
    }
    await hardDeleteWithRegistry(userId, 'projects', id, name);
  }
}
