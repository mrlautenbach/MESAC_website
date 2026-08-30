import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

type AuditParams = {
  actorId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string;
  schoolId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
};

// Append-only: this is the only place that writes to AuditLog. There is
// intentionally no update/delete helper anywhere in the codebase.
export async function recordAudit(params: AuditParams, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId,
      actorLabel: params.actorLabel,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      schoolId: params.schoolId ?? null,
      summary: params.summary,
      beforeJson: params.before === undefined ? undefined : (params.before as Prisma.InputJsonValue),
      afterJson: params.after === undefined ? undefined : (params.after as Prisma.InputJsonValue),
    },
  });
}
