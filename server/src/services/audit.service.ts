import { db } from '../db/connection.js';
import { newId } from '../utils/id.js';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Append an entry to the system-wide audit log (PRD 8.3.9). */
export function audit(entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, before_value, after_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    entry.userId ?? null,
    entry.action,
    entry.entityType ?? null,
    entry.entityId ?? null,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
  );
}
