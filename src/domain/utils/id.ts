/**
 * Collision-free RFC-4122 UUID v4 generator for offline-first entities & backups.
 */

export type EntityIdPrefix =
  | 'prj'
  | 'cnt'
  | 'acc'
  | 'tx'
  | 'obl'
  | 'pay'
  | 'alloc'
  | 'bdg'
  | 'idem-tx'
  | 'idem-pay';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // RFC-4122 v4 fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateEntityId(prefix: EntityIdPrefix): string {
  return `${prefix}-${generateUuid()}`;
}
