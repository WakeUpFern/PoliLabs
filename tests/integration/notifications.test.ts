import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/infrastructure/database/schema";
import { IncidentService } from "../../src/modules/incidents/application/incidents";
import { DrizzleIncidentStore } from "../../src/modules/incidents/infrastructure/incident-store";
import { NotificationService } from "../../src/modules/notifications/application/notifications";
import { DeliveryDispatcher } from "../../src/modules/notifications/application/delivery-dispatcher";
import {
  DrizzleDeliveryStore,
  DrizzleNotificationStore,
} from "../../src/modules/notifications/infrastructure/notification-store";
import { FileEmailSender } from "../../src/modules/notifications/infrastructure/file-email-sender";
import { recordNotificationEvent } from "../../src/modules/notifications/infrastructure/notification-outbox";
import { NotificationError } from "../../src/modules/notifications/domain/notifications";
import { operationFixture } from "./operation-fixture";

test("Notifications I outbox, center and email delivery in PostgreSQL", async (t) => {
  const f = await operationFixture();
  const { db, actor, student, resourceRows, userIds, labIds, slug } = f;
  const incidents = new IncidentService(new DrizzleIncidentStore(db));
  const center = new NotificationService(new DrizzleNotificationStore(db));
  const deliveries = new DrizzleDeliveryStore(db);
  const origin = "http://localhost:3000";
  const outbox = await mkdtemp(join(tmpdir(), "labora-outbox-"));
  const sender = new FileEmailSender(
    outbox,
    "Labora <no-reply@labora.invalid>",
  );
  const report = (severity: string, who = student) =>
    incidents.report({
      ...who,
      targetKind: "resource",
      targetId: resourceRows[0].id,
      description: "Fuga de aceite con datos que no deben copiarse",
      severity,
    });
  const resolve = async (incidentId: string) => {
    await incidents.transition({
      ...actor,
      incidentId,
      next: "in_review",
      expectedVersion: 1,
      note: "Revisión",
    });
    return incidents.transition({
      ...actor,
      incidentId,
      next: "resolved",
      expectedVersion: 2,
      note: "Se cambió el sello",
    });
  };
  const rows = (referenceId: string) =>
    db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.referenceId, referenceId));
  const deliveryOf = async (notificationId: string) =>
    (
      await db
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notificationId))
    )[0];
  try {
    await t.test(
      "a critical report notifies only reviewers of its laboratory and queues their email atomically",
      async () => {
        const incident = await report("high");
        const created = await rows(incident.id);
        assert.deepEqual(
          created.map((n) => [n.userId, n.laboratoryId, n.type]),
          [[userIds[0], labIds[0], "incident.reported"]],
        );
        assert.equal(created[0].title, "Nueva incidencia de severidad alta");
        assert.doesNotMatch(created[0].body, /aceite/);
        const delivery = await deliveryOf(created[0].id);
        assert.equal(delivery.status, "pending");
        assert.equal(delivery.channel, "email");
        assert.equal(delivery.attempts, 0);
      },
    );
    await t.test("lower severities stay in-app without email", async () => {
      const incident = await report("medium");
      const [n] = await rows(incident.id);
      assert.equal(n.userId, userIds[0]);
      assert.equal(await deliveryOf(n.id), undefined);
    });
    await t.test(
      "a rejected report leaves no notification behind",
      async () => {
        const before = await db.select().from(schema.notifications);
        await assert.rejects(
          incidents.report({
            ...student,
            targetKind: "resource",
            targetId: resourceRows[2].id, // belongs to another laboratory
            description: "Fuera de alcance",
            severity: "high",
          }),
        );
        assert.equal(
          (await db.select().from(schema.notifications)).length,
          before.length,
        );
      },
    );
    await t.test("re-emitting the same event is idempotent", async () => {
      const incident = await report("high");
      await db.transaction(async (tx) => {
        const again = await recordNotificationEvent(tx, {
          type: "IncidentReported",
          laboratoryId: labIds[0],
          incidentId: incident.id,
          reportedBy: student.actorUserId,
          severity: "high",
          targetName: "Machine",
          spaceName: "Room A",
        });
        assert.deepEqual(again, []);
      });
      const created = await rows(incident.id);
      assert.equal(created.length, 1);
    });
    await t.test(
      "the center is scoped to the recipient and reading is idempotent",
      async () => {
        const own = await center.list({ actorUserId: actor.actorUserId });
        assert.ok(own.length >= 3);
        assert.ok(own.every((n) => n.laboratorySlug === slug));
        assert.deepEqual(
          await center.list({ actorUserId: student.actorUserId }),
          [],
        );
        const unread = await center.unreadCount({
          actorUserId: actor.actorUserId,
        });
        assert.equal(unread, own.length);
        await assert.rejects(
          center.markRead({
            actorUserId: student.actorUserId,
            notificationId: own[0].id,
          }),
          (e: unknown) =>
            e instanceof NotificationError && e.code === "not-found",
        );
        const first = await center.markRead({
          actorUserId: actor.actorUserId,
          notificationId: own[0].id,
        });
        assert.ok(first.readAt);
        const second = await center.markRead({
          actorUserId: actor.actorUserId,
          notificationId: own[0].id,
        });
        assert.equal(second.readAt?.getTime(), first.readAt.getTime());
        assert.equal(
          await center.unreadCount({ actorUserId: actor.actorUserId }),
          unread - 1,
        );
        assert.equal(
          await center.markAllRead({ actorUserId: actor.actorUserId }),
          unread - 1,
        );
        assert.equal(
          await center.unreadCount({ actorUserId: actor.actorUserId }),
          0,
        );
      },
    );
    await t.test(
      "resolution notifies the reporter by email and never the resolver",
      async () => {
        const incident = await report("low");
        await resolve(incident.id);
        const resolved = (await rows(incident.id)).filter(
          (n) => n.type === "incident.resolved",
        );
        assert.deepEqual(
          resolved.map((n) => n.userId),
          [student.actorUserId],
        );
        assert.equal((await deliveryOf(resolved[0].id)).status, "pending");
        const own = await report("low", actor);
        await resolve(own.id);
        assert.deepEqual(
          (await rows(own.id)).filter((n) => n.type === "incident.resolved"),
          [],
        );
      },
    );
    await t.test(
      "dispatch writes the email once, records the recipient and links to the authorized page",
      async () => {
        const incident = await report("high");
        const [n] = await rows(incident.id);
        // Two concurrent dispatchers never send the same delivery twice.
        const sends: string[] = [];
        const slow = {
          async send(m: Parameters<typeof sender.send>[0]) {
            sends.push(m.id);
            await new Promise((r) => setTimeout(r, 20));
            await sender.send(m);
          },
        };
        await Promise.all([
          new DeliveryDispatcher(deliveries, slow, origin).dispatch(),
          new DeliveryDispatcher(deliveries, slow, origin).dispatch(),
        ]);
        assert.equal(new Set(sends).size, sends.length);
        const delivery = await deliveryOf(n.id);
        assert.equal(delivery.status, "sent");
        assert.equal(delivery.attempts, 1);
        assert.match(delivery.recipient ?? "", /@invalid\.test$/);
        assert.ok(delivery.sentAt);
        const content = await readFile(
          join(outbox, `${delivery.id}.eml`),
          "utf8",
        );
        assert.match(content, new RegExp(`To: ${delivery.recipient}`));
        assert.ok(
          content.includes(
            `${origin}/app/labs/${slug}/incidents/${incident.id}?scope=laboratory`,
          ),
        );
        assert.doesNotMatch(content, /aceite/);
      },
    );
    await t.test(
      "failures are retried later and not sent again meanwhile",
      async () => {
        const incident = await report("high");
        const [n] = await rows(incident.id);
        await new DeliveryDispatcher(
          deliveries,
          {
            async send() {
              throw new Error("provider down");
            },
          },
          origin,
        ).dispatch();
        const delivery = await deliveryOf(n.id);
        assert.equal(delivery.status, "pending");
        assert.equal(delivery.attempts, 1);
        assert.equal(delivery.lastError, "send-failed");
        assert.ok(delivery.nextAttemptAt.getTime() > Date.now() + 30_000);
        await new DeliveryDispatcher(deliveries, sender, origin).dispatch();
        assert.equal((await deliveryOf(n.id)).status, "pending");
        assert.equal(
          (await readdir(outbox)).includes(`${delivery.id}.eml`),
          false,
        );
      },
    );
    await t.test(
      "former members neither see notifications nor receive pending email",
      async () => {
        const incident = await report("high");
        const [n] = await rows(incident.id);
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: false })
          .where(
            and(
              eq(schema.laboratoryMemberships.userId, userIds[0]),
              eq(schema.laboratoryMemberships.laboratoryId, labIds[0]),
            ),
          );
        try {
          assert.deepEqual(await center.list({ actorUserId: userIds[0] }), []);
          await assert.rejects(
            center.markRead({ actorUserId: userIds[0], notificationId: n.id }),
            NotificationError,
          );
          await new DeliveryDispatcher(deliveries, sender, origin).dispatch();
          const delivery = await deliveryOf(n.id);
          assert.equal(delivery.status, "skipped");
          assert.equal(delivery.recipient, null);
        } finally {
          await db
            .update(schema.laboratoryMemberships)
            .set({ isActive: true })
            .where(
              and(
                eq(schema.laboratoryMemberships.userId, userIds[0]),
                eq(schema.laboratoryMemberships.laboratoryId, labIds[0]),
              ),
            );
        }
      },
    );
    await t.test(
      "PostgreSQL rejects inconsistent delivery states",
      async () => {
        const [n] = await db
          .select()
          .from(schema.notifications)
          .where(inArray(schema.notifications.laboratoryId, labIds))
          .limit(1);
        await assert.rejects(
          db.insert(schema.notificationDeliveries).values({
            notificationId: n.id,
            channel: "email",
            status: "sent",
          }),
        );
      },
    );
  } finally {
    await rm(outbox, { recursive: true, force: true });
    await f.cleanup();
  }
});
