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

export type SearchFilterCategory = 'all' | 'activity' | 'bills' | 'projects' | 'accounts' | 'contacts';

export interface SearchLedgerInput {
  query: string;
  accounts: readonly Account[];
  projects: readonly Project[];
  contacts: readonly Contact[];
  transactions: readonly Transaction[];
  obligations: readonly Obligation[];
  payments: readonly Payment[];
  now?: Date;
}

export interface SearchResultsBundle {
  readonly query: string;
  readonly tokens: readonly string[];
  readonly activity: readonly ActivityFeedItem[];
  readonly bills: readonly Obligation[];
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

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

const MONTH_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

const WEEKDAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Expands a YYYY-MM-DD date string into natural searchable tokens:
 * e.g. "2026-04-12" -> "2026-04-12 2026 april apr 12 sunday today"
 */
export function searchableDateTokens(
  rawDate: string | undefined,
  todayKey: string,
  yesterdayKey: string
): string {
  if (!rawDate) return '';
  const key = rawDate.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;

  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return key;

  const parsed = new Date(year, monthIdx, day);
  const tokens = [
    key,
    String(year),
    MONTH_NAMES[monthIdx],
    MONTH_SHORT[monthIdx],
    String(day),
    match[3],
    WEEKDAY_NAMES[parsed.getDay()],
  ];

  if (key === todayKey) tokens.push('today');
  else if (key === yesterdayKey) tokens.push('yesterday');

  return tokens.join(' ');
}

/**
 * Computes Optimal String Alignment (Damerau-Levenshtein) edit distance
 * with early exit when distance exceeds `maxDist`.
 * Counts insertion, deletion, substitution, and adjacent transposition each as 1 edit.
 */
export function damerauLevenshteinDistance(
  a: string,
  b: string,
  maxDist: number
): number {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (a === b) return 0;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () =>
    new Array<number>(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, dp[i - 2][j - 2] + 1); // transposition
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }

  return dp[lenA][lenB];
}

function matchesAllTokens(haystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const norm = normalizeSearchText(haystack);
  let words: string[] | null = null;

  for (const token of tokens) {
    // Fast exact / substring match first
    if (norm.includes(token)) continue;

    // Fuzzy typo fallback only for non-numeric words with 4+ letters
    if (token.length < 4 || /\d/.test(token)) return false;

    if (!words) {
      words = norm.split(' ').filter(Boolean);
    }

    const maxDist = token.length >= 7 ? 2 : 1;
    let fuzzyMatched = false;
    for (const word of words) {
      if (word.length < 3 || /\d/.test(word)) continue;
      if (damerauLevenshteinDistance(token, word, maxDist) <= maxDist) {
        fuzzyMatched = true;
        break;
      }
    }

    if (!fuzzyMatched) return false;
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
    now = new Date(),
  } = input;

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return {
      query,
      tokens: [],
      activity: [],
      bills: [],
      projects: [],
      accounts: [],
      contacts: [],
      totalCount: 0,
    };
  }

  const todayKey = toLocalDateKey(now);
  const yesterdayKey = toLocalDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  );

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
      searchableDateTokens(item.date, todayKey, yesterdayKey),
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

  const matchedBills = obligations
    .filter((o) => {
      if (o.isDeleted || o.status === 'voided' || o.direction !== 'payable') return false;
      const projName = o.projectId ? projectMap.get(o.projectId)?.name || '' : 'personal';
      const contactName = o.contactId ? contactMap.get(o.contactId)?.name || '' : '';
      const haystack = [
        o.title,
        'bill',
        o.type,
        o.status,
        o.status === 'partially_paid' ? 'partial' : '',
        projName,
        contactName,
        o.materialDetails?.itemName || '',
        o.notes || '',
        searchableDateTokens(o.date, todayKey, yesterdayKey),
        searchableAmountTokens(o.totalAmountMinor),
        searchableAmountTokens(o.remainingAmountMinor),
        searchableAmountTokens(o.allocatedAmountMinor),
      ].join(' ');
      return matchesAllTokens(haystack, tokens);
    })
    .sort((a, b) => {
      const aOpen = a.status !== 'paid' && a.remainingAmountMinor > 0 ? 0 : 1;
      const bOpen = b.status !== 'paid' && b.remainingAmountMinor > 0 ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return (b.date || '').localeCompare(a.date || '');
    });

  const matchedProjects = projects.filter((p) => {
    if (p.isDeleted) return false;
    const haystack = [
      p.name,
      p.code || '',
      p.description || '',
      p.clientName || '',
      p.location || '',
      p.status,
      searchableDateTokens(p.startDate, todayKey, yesterdayKey),
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
    bills: matchedBills,
    projects: matchedProjects,
    accounts: matchedAccounts,
    contacts: matchedContacts,
    totalCount:
      matchedActivity.length +
      matchedBills.length +
      matchedProjects.length +
      matchedAccounts.length +
      matchedContacts.length,
  };
}
