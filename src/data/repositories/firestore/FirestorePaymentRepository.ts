import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  writeBatch,
  updateDoc, 
  query,
  where,
  orderBy,
  limit,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '@/data/firebase/firestoreClient';
import { Payment, Allocation } from '@/domain/entities';
import { IPaymentRepository, PaymentFilter } from '../interfaces';

export class FirestorePaymentRepository implements IPaymentRepository {
  private getUserPaymentsCollection(userId: string) {
    return collection(db, 'users', userId, 'payments');
  }

  private getUserAllocationsCollection(userId: string) {
    return collection(db, 'users', userId, 'allocations');
  }

  async getById(userId: string, id: string): Promise<Payment | null> {
    const docRef = doc(db, 'users', userId, 'payments', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Payment;
  }

  async list(userId: string, filter?: PaymentFilter): Promise<Payment[]> {
    const constraints: QueryConstraint[] = [];

    if (filter?.projectId) {
      constraints.push(where('projectId', '==', filter.projectId));
    }
    if (filter?.contactId) {
      constraints.push(where('contactId', '==', filter.contactId));
    }
    if (filter?.accountId) {
      constraints.push(where('accountId', '==', filter.accountId));
    }

    constraints.push(orderBy('date', 'desc'));

    const q = query(this.getUserPaymentsCollection(userId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Payment);
  }

  async getLatestByContact(userId: string, contactId: string): Promise<Payment | null> {
    const q = query(
      this.getUserPaymentsCollection(userId),
      where('contactId', '==', contactId),
      where('status', '==', 'posted'),
      orderBy('date', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as Payment;
  }

  async create(userId: string, payment: Payment, allocations?: Allocation[]): Promise<void> {
    const batch = writeBatch(db);

    const paymentDocRef = doc(db, 'users', userId, 'payments', payment.id);
    batch.set(paymentDocRef, { ...payment });

    if (allocations && allocations.length > 0) {
      for (const alloc of allocations) {
        const allocDocRef = doc(db, 'users', userId, 'allocations', alloc.id);
        batch.set(allocDocRef, { ...alloc });
      }
    }

    await batch.commit();
  }

  async void(userId: string, id: string): Promise<void> {
    const docRef = doc(db, 'users', userId, 'payments', id);
    await updateDoc(docRef, {
      status: 'voided',
      updatedAt: new Date().toISOString()
    });
  }

  async listAllocationsForPayment(userId: string, paymentId: string): Promise<Allocation[]> {
    const q = query(
      this.getUserAllocationsCollection(userId),
      where('paymentId', '==', paymentId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Allocation);
  }

  async listAllocationsForObligation(userId: string, obligationId: string): Promise<Allocation[]> {
    const q = query(
      this.getUserAllocationsCollection(userId),
      where('obligationId', '==', obligationId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Allocation);
  }
}

