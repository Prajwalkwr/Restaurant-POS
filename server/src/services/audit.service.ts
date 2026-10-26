import { prisma } from '../lib/prisma.js';

export async function audit(params: {
  restaurantId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: any;
  after?: any;
  reason?: string;
}) {
  await prisma.auditLog.create({
    data: {
      restaurantId: params.restaurantId,
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before ?? undefined,
      after: params.after ?? undefined,
      reason: params.reason,
    },
  });
}
