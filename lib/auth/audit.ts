import "server-only";

import sql from "@/db";
import { getCurrentUser, requestContext } from "./session";
import type { Role } from "./permissions";

export type AuditActor = {
  id?: number | null;
  name: string;
  email: string;
  role?: Role | string | null;
};

type AuditInput = {
  action: string;
  summary: string;
  entityType?: string | null;
  entityId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  actor?: AuditActor | null;
  context?: { ipAddress: string | null; userAgent: string | null };
};

/**
 * Records an administrative action. Auditing must never take down the action
 * it describes, so failures are logged to the server console instead.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const actor =
      input.actor === undefined ? await getCurrentUser() : input.actor;
    const context = input.context ?? (await requestContext());

    await sql`
      insert into audit_logs (
        actor_user_id, actor_name, actor_email, actor_role,
        action, entity_type, entity_id, summary, metadata,
        ip_address, user_agent
      )
      values (
        ${actor?.id ?? null},
        ${actor?.name ?? "Unknown"},
        ${actor?.email ?? "unknown"},
        ${actor?.role ?? null},
        ${input.action},
        ${input.entityType ?? null},
        ${input.entityId === undefined || input.entityId === null
          ? null
          : String(input.entityId)},
        ${input.summary},
        ${input.metadata ? sql.json(input.metadata) : null},
        ${context.ipAddress},
        ${context.userAgent}
      )
    `;
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
