import { describe, expect, it } from 'vitest';
import { Account, Contact, Obligation, Payment, Project, Transaction } from '@/domain/entities';
import { searchLedgerEntities, tokenizeQuery } from './searchEngine';

describe('Normalized In-Memory Search Engine', () => {
  const accounts: Account[] = [
    {
      id: 'acc-1',
      name: 'HBL Business Bank',
      type: 'bank',
      institution: 'Habib Bank',
      openingBalanceMinor: 0,
      currentBalanceMinor: 500_000,
      isArchived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const projects: Project[] = [
    {
      id: 'prj-1',
      name: 'DHA Villa A',
      location: 'Lahore',
      startDate: '2026-01-01',
      status: 'active',
      budgetMinor: 10_000_000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const contacts: Contact[] = [
    {
      id: 'cnt-1',
      name: 'Ali Cement Suppliers',
      phone: '0300-1234567',
      roles: ['supplier'],
      associatedProjectIds: ['prj-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const transactions: Transaction[] = [
    {
      id: 'tx-1',
      idempotencyKey: 'i1',
      type: 'expense',
      scope: 'personal',
      accountId: 'acc-1',
      categoryId: 'food_dining',
      amountMinor: 2_500_000, // Rs 25,000.00
      date: '2026-04-12',
      notes: 'Family dinner at Monal',
      status: 'posted',
      createdAt: '2026-04-12T18:00:00.000Z',
      updatedAt: '2026-04-12T18:00:00.000Z',
    },
  ];

  const obligations: Obligation[] = [
    {
      id: 'obl-1',
      type: 'purchase',
      direction: 'payable',
      projectId: 'prj-1',
      contactId: 'cnt-1',
      title: 'Maple Leaf Cement 200 bags',
      date: '2026-04-10',
      totalAmountMinor: 25_000_000,
      allocatedAmountMinor: 0,
      remainingAmountMinor: 25_000_000,
      status: 'unpaid',
      createdAt: '2026-04-10T10:00:00.000Z',
      updatedAt: '2026-04-10T10:00:00.000Z',
    },
  ];

  const payments: Payment[] = [];

  it('normalizes commas in numbers and case-insensitive tokens', () => {
    expect(tokenizeQuery('  Villa   25,000  ')).toEqual(['villa', '25000']);
  });

  it('matches multi-word queries across title, project, amount, and category', () => {
    const res = searchLedgerEntities({
      query: 'cement villa',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(res.activity).toHaveLength(1);
    expect(res.activity[0].id).toBe('ob-obl-1');

    const byAmount = searchLedgerEntities({
      query: '25,000',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(byAmount.activity.some((a) => a.id === 'tx-tx-1')).toBe(true);

    const byCategory = searchLedgerEntities({
      query: 'food dining',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(byCategory.activity).toHaveLength(1);
    expect(byCategory.activity[0].id).toBe('tx-tx-1');
  });

  it('matches projects, accounts, and contacts simultaneously', () => {
    const res = searchLedgerEntities({
      query: 'habib',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(res.accounts).toHaveLength(1);
    expect(res.accounts[0].id).toBe('acc-1');

    const resContact = searchLedgerEntities({
      query: '0300 1234567',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(resContact.contacts).toHaveLength(1);
    expect(resContact.contacts[0].id).toBe('cnt-1');
  });

  it('returns empty results for blank queries', () => {
    const res = searchLedgerEntities({
      query: '   ',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(res.totalCount).toBe(0);
  });

  it('matches natural dates including month names, today, and yesterday', () => {
    const now = new Date(2026, 3, 12); // Apr 12, 2026

    const byMonth = searchLedgerEntities({
      query: 'april',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
      now,
    });
    expect(byMonth.activity).toHaveLength(2);

    const byToday = searchLedgerEntities({
      query: 'today dinner',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
      now,
    });
    expect(byToday.activity).toHaveLength(1);
    expect(byToday.activity[0].id).toBe('tx-tx-1');

    const byYesterday = searchLedgerEntities({
      query: 'yesterday',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
      now: new Date(2026, 3, 13), // Apr 13 -> Apr 12 is yesterday
    });
    expect(byYesterday.activity.some((a) => a.id === 'tx-tx-1')).toBe(true);
  });

  it('tolerates spelling typos via Damerau-Levenshtein while keeping numbers exact', () => {
    // Missing letter ("cemnt"), swapped letters ("cemnet"), wrong letter ("vila")
    const resMissing = searchLedgerEntities({
      query: 'cemnt vila',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(resMissing.activity.some((a) => a.id === 'ob-obl-1')).toBe(true);

    const resSwapped = searchLedgerEntities({
      query: 'cemnet',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(resSwapped.activity.some((a) => a.id === 'ob-obl-1')).toBe(true);
    expect(resSwapped.contacts.some((c) => c.id === 'cnt-1')).toBe(true);

    // 2 typos allowed on 7+ char words ("supliers" / "supleirs" -> "suppliers")
    const resLongTypo = searchLedgerEntities({
      query: 'supleirs',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(resLongTypo.contacts).toHaveLength(1);

    // Numbers must stay exact ("26000" must NOT fuzzy-match "25000")
    const resWrongNum = searchLedgerEntities({
      query: '26000',
      accounts,
      projects,
      contacts,
      transactions,
      obligations,
      payments,
    });
    expect(resWrongNum.totalCount).toBe(0);
  });
});
