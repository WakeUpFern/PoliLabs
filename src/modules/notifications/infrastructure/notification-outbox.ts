import { and, eq, ne } from "drizzle-orm";
import type { OperationTransaction } from "@/modules/identity/infrastructure/authorize-locked";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
} from "@/modules/identity/infrastructure/access-schema";
import {
  planNotification,
  type NotificationEvent,
} from "../domain/notifications";
import { notifications, notificationDeliveries } from "./notification-schema";
// Called by business modules inside their own transaction: the notification
// and its pending email delivery commit or roll back with the business change
// (transactional outbox). Nothing is sent here.
export async function recordNotificationEvent(
  tx: OperationTransaction,
  event: NotificationEvent,
) {
  const plan = planNotification(event);
  const rule = plan.recipients;
  const recipients = await tx
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(
      laboratoryMemberships,
      and(
        eq(laboratoryMemberships.userId, users.id),
        eq(laboratoryMemberships.laboratoryId, plan.laboratoryId),
        eq(laboratoryMemberships.isActive, true),
      ),
    )
    .innerJoin(
      laboratories,
      and(
        eq(laboratories.id, laboratoryMemberships.laboratoryId),
        eq(laboratories.isActive, true),
      ),
    )
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, laboratoryMemberships.id),
    )
    .innerJoin(
      rolePermissions,
      eq(rolePermissions.roleId, membershipRoles.roleId),
    )
    .innerJoin(
      permissions,
      and(
        eq(permissions.id, rolePermissions.permissionId),
        eq(permissions.key, rule.permission),
      ),
    )
    .where(
      and(
        eq(users.isActive, true),
        ne(users.id, rule.exclude),
        rule.kind === "user" ? eq(users.id, rule.userId) : undefined,
      ),
    );
  if (!recipients.length) return [];
  const created = await tx
    .insert(notifications)
    .values(
      recipients.map((r) => ({
        userId: r.id,
        laboratoryId: plan.laboratoryId,
        type: plan.type,
        title: plan.title,
        body: plan.body,
        referenceType: plan.referenceType,
        referenceId: plan.referenceId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notifications.id, userId: notifications.userId });
  if (plan.email && created.length)
    await tx
      .insert(notificationDeliveries)
      .values(
        created.map((n) => ({
          notificationId: n.id,
          channel: "email" as const,
        })),
      )
      .onConflictDoNothing();
  return created;
}
