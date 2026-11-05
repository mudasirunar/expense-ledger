import { 
  Project, 
  Contact, 
  Account, 
  Transaction, 
  Obligation, 
  Payment, 
  Allocation,
  TransactionScope,
  ObligationStatus
} from '@/domain/entities';

export interface IProjectRepository {
  getById(userId: string, id: string): Promise<Project | null>;
  list(userId: string): Promise<Project[]>;
  subscribe?(userId: string, onUpdate: (projects: Project[]) => void, onError?: (error: Error) => void): () => void;
  create(userId: string, project: Project): Promise<void>;
  update(userId: string, id: string, partial: Partial<Project>): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}

export interface IContactRepository {
  getById(userId: string, id: string): Promise<Contact | null>;
  list(userId: string): Promise<Contact[]>;
  subscribe?(userId: string, onUpdate: (contacts: Contact[]) => void, onError?: (error: Error) => void): () => void;
  listByProject(userId: string, projectId: string): Promise<Contact[]>;
  create(userId: string, contact: Contact): Promise<void>;
  update(userId: string, id: string, partial: Partial<Contact>): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}

export interface IAccountRepository {
  getById(userId: string, id: string): Promise<Account | null>;
  list(userId: string): Promise<Account[]>;
  subscribe?(userId: string, onUpdate: (accounts: Account[]) => void, onError?: (error: Error) => void): () => void;
  create(userId: string, account: Account): Promise<void>;
  update(userId: string, id: string, partial: Partial<Account>): Promise<void>;
  updateBalance(userId: string, id: string, newBalanceMinor: number): Promise<void>;
}

export interface TransactionFilter {
  readonly projectId?: string;
  readonly accountId?: string;
  readonly scope?: TransactionScope;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface ITransactionRepository {
  getById(userId: string, id: string): Promise<Transaction | null>;
  list(userId: string, filter?: TransactionFilter): Promise<Transaction[]>;
  subscribe?(userId: string, onUpdate: (transactions: Transaction[]) => void, onError?: (error: Error) => void): () => void;
  create(userId: string, transaction: Transaction): Promise<void>;
  void(userId: string, id: string): Promise<void>;
}

export interface ObligationFilter {
  readonly projectId?: string;
  readonly contactId?: string;
  readonly status?: ObligationStatus;
}

export interface IObligationRepository {
  getById(userId: string, id: string): Promise<Obligation | null>;
  list(userId: string, filter?: ObligationFilter): Promise<Obligation[]>;
  create(userId: string, obligation: Obligation): Promise<void>;
  update(userId: string, id: string, partial: Partial<Obligation>): Promise<void>;
  void(userId: string, id: string): Promise<void>;
}

export interface PaymentFilter {
  readonly projectId?: string;
  readonly contactId?: string;
  readonly accountId?: string;
}

export interface IPaymentRepository {
  getById(userId: string, id: string): Promise<Payment | null>;
  list(userId: string, filter?: PaymentFilter): Promise<Payment[]>;
  getLatestByContact(userId: string, contactId: string): Promise<Payment | null>;
  create(userId: string, payment: Payment, allocations?: Allocation[]): Promise<void>;
  void(userId: string, id: string): Promise<void>;
  listAllocationsForPayment(userId: string, paymentId: string): Promise<Allocation[]>;
  listAllocationsForObligation(userId: string, obligationId: string): Promise<Allocation[]>;
}

