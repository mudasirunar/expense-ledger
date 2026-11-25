/**
 * Normalized In-Memory Global Search Engine
 * Pure, instant, 100% offline search across all ledger entities:
 * - Activity (Transactions, Transfers, Bills/Obligations, Payments)
 * - Projects
 * - Accounts
 * - Contacts
 */

import {
  Account,
  Contact,
  Obligation,
  Payment,
  Project,
  Transaction,
} from '@/domain/entities';
import { Money } from './money';
import { ActivityFeedItem, buildActivityFeed } from './dashboardAnalytics';
import { getPersonalCategoryLabel } from './budgetEngine';

export type SearchFilterCategory = 'all' | 'activity' | 'projects' | 'accounts' | 'contacts';

export interface SearchLedgerInput {
  query: string;
  accounts: readonly Account[];
  projects: readonly Project[];
  contacts: readonly Contact[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  payments: readonly Payment[];
}

export interface SearchResultsBundle {
  readonly query: string;
  readonly tokens: readonly string[];
  readonly activity: readonly ActivityFeedItem[];
  readonly projects: readonly Project[];
  readonly accounts: readonly Account[];
  readonly contacts: readonly Contact[];
  readonly totalCount: number;
}

/**
 * Normalizes text for forgiving, punctuation-agnostic search:
 * - Lowercases
 * - Removes currency prefixes & formatting commas/punctuation (so "25000" matches "Rs 25,000.00")
 * - Collapses whitespace
 */
export function normalizeSearchText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,_•—–-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produces both formatted and compact numeric forms for an integer minor-unit amount
 * so "25000", "25,000", and "25000.50" all match seamlessly.
 */
function searchableAmountTokens(minorUnits: number): string {
  const major = Money.toMajorString(minorUnits || 0);
  const whole = major.endsWith('.00') ? major.slice(0, -3) : major;
  return `${major} ${whole}`;
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  // Strip commas inside numbers (e.g. "25,000" -> "25000") by joining digits before splitting
  const compactNumbers = query
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1$2');
  const cleaned = normalizeSearchText(compactNumbers);
  return cleaned ? cleaned.split(' ').filter(Boolean) : [];
}

function matchesAllTokens(haystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const norm = normalizeSearchText(haystack);
  for (const token of tokens) {
    if (!norm.includes(token)) return false;
  }
  return true;
}

export function searchLedgerEntities(input: SearchLedgerInput): SearchResultsBundle {
  const {
    query,
    accounts,
    projects,
    contacts,
    transactions,
    obligations,
    payments,
  } = input;

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return {
      query,
      tokens: [],
      activity: [],
      projects: [],
      accounts: [],
      contacts: [],
      totalCount: 0,
    };
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  // Build full activity feed (already sorted latest-first) and enrich each item's search haystack
  const feed = buildActivityFeed({
    accounts,
    projects,
    transactions,
    obligations,
    payments,
    timeHorizon: 'all',
    scopeFilter: 'all',
  });

  const txById = new Map(transactions.map((t) => [t.id, t]));
  const obById = new Map(obligations.map((o) => [o.id, o]));
  const payById = new Map(payments.map((p) => [p.id, p]));

  const matchedActivity: ActivityFeedItem[] = [];
  for (const item of feed) {
    const parts: string[] = [
      item.title,
      item.subtitle,
      item.badge,
      item.date,
      searchableAmountTokens(item.amountMinor),
    ];

    if (item.kind === 'transaction') {
      const tx = txById.get(item.id.replace(/^tx-/, ''));
      if (tx) {
        if (tx.notes) parts.push(tx.notes);
        if (tx.categoryId) parts.push(tx.categoryId, getPersonalCategoryLabel(tx.categoryId));
        if (tx.contactId) parts.push(contactMap.get(tx.contactId)?.name || '');
        if (tx.projectId) parts.push(projectMap.get(tx.projectId)?.name || '');
        if (tx.accountId) parts.push(accountMap.get(tx.accountId)?.name || '');
        if (tx.targetAccountId) parts.push(accountMap.get(tx.targetAccountId)?.name || '');
      }
    } else if (item.kind === 'obligation') {
      const ob = obById.get(item.id.replace(/^ob-/, ''));
      if (ob) {
        if (ob.notes) parts.push(ob.notes);
        if (ob.status) parts.push(ob.status);
        if (ob.materialDetails?.itemName) parts.push(ob.materialDetails.itemName);
        if (ob.contactId) parts.push(contactMap.get(ob.contactId)?.name || '');
        if (ob.projectId) parts.push(projectMap.get(ob.projectId)?.name || '');
      }
    } else if (item.kind === 'payment') {
      const pay = payById.get(item.id.replace(/^pay-/, ''));
      if (pay) {
        if (pay.notes) parts.push(pay.notes);
        if (pay.method) parts.push(pay.method);
        if (pay.referenceNumber) parts.push(pay.referenceNumber);
        if (pay.contactId) parts.push(contactMap.get(pay.contactId)?.name || '');
        if (pay.projectId) parts.push(projectMap.get(pay.projectId)?.name || '');
        if (pay.accountId) parts.push(accountMap.get(pay.accountId)?.name || '');
      }
    }

    if (matchesAllTokens(parts.join(' '), tokens)) {
      matchedActivity.push(item);
    }
  }

  const matchedProjects = projects.filter((p) => {
    if (p.isDeleted) return false;
    const haystack = [
      p.name,
      p.code || '',
      p.description || '',
      p.clientName || '',
      p.location || '',
      p.status,
      searchableAmountTokens(p.budgetMinor),
    ].join(' ');
    return matchesAllTokens(haystack, tokens);
  });

  const matchedAccounts = accounts.filter((a) => {
    if (a.isDeleted || a.isArchived) return false;
    const haystack = [
      a.name,
      a.type,
      a.institution || '',
      a.accountNumber || '',
      searchableAmountTokens(a.currentBalanceMinor),
    ].join(' ');
    return matchesAllTokens(haystack, tokens);
  });

  const matchedContacts = contacts.filter((c) => {
    if (c.isDeleted) return false;
    const haystack = [
      c.name,
      c.companyName || '',
      c.phone || '',
      c.email || '',
      c.notes || '',
      ...c.roles,
    ].join(' ');
    return matchesAllTokens(haystack, tokens);
  });

  return {
    query,
    tokens,
    activity: matchedActivity,
    projects: matchedProjects,
    accounts: matchedAccounts,
    contacts: matchedContacts,
    totalCount:
      matchedActivity.length +
      matchedProjects.length +
      matchedAccounts.length +
      matchedContacts.length,
  };
}
