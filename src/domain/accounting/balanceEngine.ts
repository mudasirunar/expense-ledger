import { 
  Account, 
  Transaction, 
  Payment, 
  Obligation, 
  Project, 
  Contact 
} from '../entities';

export interface ProjectFinancialSummary {
  projectId: string;
  totalBudgetMinor: number;
  totalObligationsMinor: number; // Accrued project cost
  totalPaidMinor: number;        // Cash disbursed for this project
  totalPayableRemainingMinor: number;
  remainingBudgetMinor: number;
  budgetUtilizationPercentage: number;
}

export interface ContactFinancialSummary {
  contactId: string;
  totalPaidToContactMinor: number;     // Cash sent
  totalReceivedFromContactMinor: number; // Cash received
  netPayableMinor: number;              // We owe contact
  netReceivableMinor: number;           // Contact owes us
  latestOutgoingPayment?: Payment;
  latestIncomingReceipt?: Payment;
}

export class BalanceEngine {
  /**
   * Recomputes the current balance of an account from its opening balance and ledger events.
   * Invariant: Formula must strictly account for transactions, payments, and transfers.
   */
  static computeAccountBalance(
    account: Account,
    transactions: Transaction[],
    payments: Payment[]
  ): number {
    let balance = account.openingBalanceMinor;

    // Process transactions
    for (const tx of transactions) {
      if (tx.status === 'voided') continue;

      if (tx.type === 'expense' && tx.accountId === account.id) {
        balance -= tx.amountMinor;
      } else if (tx.type === 'income' && tx.accountId === account.id) {
        balance += tx.amountMinor;
      } else if (tx.type === 'refund' && tx.accountId === account.id) {
        balance += tx.amountMinor;
      } else if (tx.type === 'transfer') {
        if (tx.accountId === account.id) {
          // Outgoing transfer decreases source account
          balance -= tx.amountMinor;
        }
        if (tx.targetAccountId === account.id) {
          // Incoming transfer increases target account
          balance += tx.amountMinor;
        }
      }
    }

    // Process payments (obligation settlements or advance disbursements)
    for (const pay of payments) {
      if (pay.status === 'voided') continue;

      if (pay.accountId === account.id) {
        if (pay.direction === 'outgoing') {
          balance -= pay.amountMinor;
        } else if (pay.direction === 'incoming') {
          balance += pay.amountMinor;
        }
      }
    }

    return balance;
  }

  /**
   * Recomputes the financial standing of a project.
   * Accrual Invariant: Project cost is derived from Obligations (costs incurred).
   * Payments settle obligations and are NOT added to project cost a second time.
   */
  static computeProjectSummary(
    project: Project,
    obligations: Obligation[],
    payments: Payment[]
  ): ProjectFinancialSummary {
    const projectObligations = obligations.filter(
      (o) => o.projectId === project.id && o.status !== 'voided' && o.direction === 'payable'
    );

    const projectPayments = payments.filter(
      (p) => p.projectId === project.id && p.status !== 'posted' ? false : p.direction === 'outgoing'
    );

    const totalObligationsMinor = projectObligations.reduce((sum, o) => sum + o.totalAmountMinor, 0);
    const totalPaidMinor = projectPayments.reduce((sum, p) => sum + p.amountMinor, 0);
    const totalPayableRemainingMinor = projectObligations.reduce((sum, o) => sum + o.remainingAmountMinor, 0);

    const remainingBudgetMinor = project.budgetMinor - totalObligationsMinor;
    const budgetUtilizationPercentage = project.budgetMinor > 0 
      ? Math.round((totalObligationsMinor / project.budgetMinor) * 100) 
      : 0;

    return {
      projectId: project.id,
      totalBudgetMinor: project.budgetMinor,
      totalObligationsMinor,
      totalPaidMinor,
      totalPayableRemainingMinor,
      remainingBudgetMinor,
      budgetUtilizationPercentage,
    };
  }

  /**
   * Recomputes a Contact's financial summary across all projects.
   * Derives Latest Payment strictly from posted payment records (not obligations).
   */
  static computeContactSummary(
    contact: Contact,
    obligations: Obligation[],
    payments: Payment[]
  ): ContactFinancialSummary {
    const contactObligations = obligations.filter(
      (o) => o.contactId === contact.id && o.status !== 'voided'
    );

    const contactPayments = payments.filter(
      (p) => p.contactId === contact.id && p.status === 'posted'
    );

    const outgoingPayments = contactPayments.filter((p) => p.direction === 'outgoing');
    const incomingPayments = contactPayments.filter((p) => p.direction === 'incoming');

    const totalPaidToContactMinor = outgoingPayments.reduce((sum, p) => sum + p.amountMinor, 0);
    const totalReceivedFromContactMinor = incomingPayments.reduce((sum, p) => sum + p.amountMinor, 0);

    const netPayableMinor = contactObligations
      .filter((o) => o.direction === 'payable')
      .reduce((sum, o) => sum + o.remainingAmountMinor, 0);

    const netReceivableMinor = contactObligations
      .filter((o) => o.direction === 'receivable')
      .reduce((sum, o) => sum + o.remainingAmountMinor, 0);

    // Latest payments: strictly sorted by date DESC, createdAt DESC
    const sortedOutgoing = [...outgoingPayments].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : b.createdAt.localeCompare(a.createdAt);
    });

    const sortedIncoming = [...incomingPayments].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      return dateCmp !== 0 ? dateCmp : b.createdAt.localeCompare(a.createdAt);
    });

    return {
      contactId: contact.id,
      totalPaidToContactMinor,
      totalReceivedFromContactMinor,
      netPayableMinor,
      netReceivableMinor,
      latestOutgoingPayment: sortedOutgoing[0],
      latestIncomingReceipt: sortedIncoming[0],
    };
  }
}

