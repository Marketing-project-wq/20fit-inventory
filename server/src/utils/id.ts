import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/**
 * Generate a human-readable document number, e.g. PO-20260630-AB12.
 * Random suffix avoids collisions without a central counter.
 */
export function documentNumber(prefix: string): string {
  const now = new Date();
  const stamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}
