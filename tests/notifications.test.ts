import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_DELIVERY_ATTEMPTS,
  NotificationError,
  nextAttemptDelayMs,
  notificationPath,
  planNotification,
  renderNotificationEmail,
} from "../src/modules/notifications/domain/notifications";
import { NotificationService } from "../src/modules/notifications/application/notifications";
import { DeliveryDispatcher } from "../src/modules/notifications/application/delivery-dispatcher";
import type {
  ClaimedDelivery,
  DeliveryStore,
  NotificationStore,
} from "../src/modules/notifications/application/notification-store";
import { FileEmailSender } from "../src/modules/notifications/infrastructure/file-email-sender";
import { readEmailConfig } from "../src/config/email-env";
const id = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const reported = {
  type: "IncidentReported" as const,
  laboratoryId: id,
  incidentId: other,
  reportedBy: id,
  targetName: "Torno",
  spaceName: "Nave",
};
test("incident reports notify reviewers in-app and email only critical ones", () => {
  const high = planNotification({ ...reported, severity: "high" });
  assert.equal(high.type, "incident.reported");
  assert.equal(high.email, true);
  assert.equal(high.title, "Nueva incidencia de severidad alta");
  assert.equal(high.body, "Torno · Nave · Severidad alta");
  assert.deepEqual(high.recipients, {
    kind: "permission",
    permission: "incident.review",
    exclude: id,
  });
  for (const severity of ["low", "medium"] as const)
    assert.equal(planNotification({ ...reported, severity }).email, false);
  const space = planNotification({
    ...reported,
    severity: "low",
    targetName: "Nave",
  });
  assert.equal(space.body, "Nave · Severidad baja");
});
test("a resolution notifies only its reporter, never the resolver, by email too", () => {
  const plan = planNotification({
    type: "IncidentResolved",
    laboratoryId: id,
    incidentId: other,
    reportedBy: other,
    resolvedBy: id,
    targetName: "Torno",
    spaceName: "Nave",
  });
  assert.equal(plan.type, "incident.resolved");
  assert.equal(plan.email, true);
  assert.deepEqual(plan.recipients, {
    kind: "user",
    userId: other,
    permission: "incident.read",
    exclude: id,
  });
});
test("paths point to the scope each recipient can authorize", () => {
  assert.equal(
    notificationPath({
      type: "incident.reported",
      laboratorySlug: "pesados",
      referenceId: other,
    }),
    `/app/labs/pesados/incidents/${other}?scope=laboratory`,
  );
  assert.equal(
    notificationPath({
      type: "incident.resolved",
      laboratorySlug: "pesados",
      referenceId: other,
    }),
    `/app/labs/pesados/incidents/${other}?scope=own`,
  );
});
test("retry delays grow exponentially and reject invalid attempts", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map(nextAttemptDelayMs),
    [60_000, 120_000, 240_000, 480_000],
  );
  for (const n of [0, -1, 1.5])
    assert.throws(() => nextAttemptDelayMs(n), NotificationError);
});
test("email rendering rejects header injection and keeps a plain-text link", () => {
  const message = renderNotificationEmail({
    deliveryId: id,
    recipientEmail: "ana@invalid.test",
    recipientName: "Ana",
    laboratoryName: "Pesados",
    title: "Tu incidencia fue resuelta",
    body: "Torno · Nave",
    url: "http://localhost:3000/app",
  });
  assert.equal(message.subject, "Tu incidencia fue resuelta · Pesados");
  assert.match(
    message.text,
    /Consulta el detalle en Labora: http:\/\/localhost:3000\/app/,
  );
  for (const recipientEmail of ["ana@invalid.test\r\nBcc: x@y", "nobody"])
    assert.throws(
      () =>
        renderNotificationEmail({
          deliveryId: id,
          recipientEmail,
          recipientName: "Ana",
          laboratoryName: "Pesados",
          title: "t",
          body: "b",
          url: "http://localhost",
        }),
      NotificationError,
    );
});
test("the notification center validates identifiers before persistence", () => {
  const store: NotificationStore = {
    run() {
      throw new Error("Must not reach persistence");
    },
  };
  const service = new NotificationService(store);
  assert.throws(
    () => service.markRead({ actorUserId: id, notificationId: "x" }),
    NotificationError,
  );
  assert.throws(() => service.list({ actorUserId: "x" }), NotificationError);
  assert.throws(
    () => service.list({ actorUserId: id, limit: 101 }),
    NotificationError,
  );
});
function fakeStore(deliveries: ClaimedDelivery[]) {
  const log: string[] = [];
  const store: DeliveryStore = {
    async attemptNext(_origin, operation) {
      const delivery = deliveries.shift();
      if (!delivery) return false;
      await operation(delivery, {
        sent: async (to) => void log.push(`sent:${delivery.id}:${to}`),
        failed: async (r) =>
          void log.push(
            `failed:${delivery.id}:${r.attempts}:${r.final}:${r.delayMs}`,
          ),
        skipped: async () => void log.push(`skipped:${delivery.id}`),
      });
      return true;
    },
  };
  return { store, log };
}
const message = (id: string) => ({
  id,
  to: "ana@invalid.test",
  subject: "s",
  text: "t",
});
test("dispatcher sends, retries with backoff, gives up after the limit and skips inactive recipients", async () => {
  const { store, log } = fakeStore([
    { id: "a", attempts: 0, recipientActive: true, message: message("a") },
    { id: "b", attempts: 0, recipientActive: true, message: message("b") },
    {
      id: "c",
      attempts: MAX_DELIVERY_ATTEMPTS - 1,
      recipientActive: true,
      message: message("c"),
    },
    { id: "d", attempts: 0, recipientActive: false, message: message("d") },
  ]);
  const sent: string[] = [];
  const result = await new DeliveryDispatcher(
    store,
    {
      async send(m) {
        if (m.id !== "a") throw new Error("provider down");
        sent.push(m.id);
      },
    },
    "http://localhost",
  ).dispatch();
  assert.deepEqual(sent, ["a"]);
  assert.deepEqual(log, [
    "sent:a:ana@invalid.test",
    "failed:b:1:false:60000",
    `failed:c:${MAX_DELIVERY_ATTEMPTS}:true:0`,
    "skipped:d",
  ]);
  assert.deepEqual(result, { sent: 1, retried: 1, failed: 1, skipped: 1 });
});
test("email configuration defaults to the local file adapter outside public/", () => {
  const config = readEmailConfig({}, "/srv/app");
  assert.equal(config.transport, "file");
  assert.equal(config.outboxDir, "/srv/app/.local-storage/email-outbox");
  assert.equal(
    readEmailConfig({ EMAIL_TRANSPORT: "disabled" }).transport,
    "disabled",
  );
  for (const env of [
    { EMAIL_TRANSPORT: "ses" },
    { EMAIL_FROM: "a@b\r\nBcc: c@d" },
    { EMAIL_OUTBOX_DIR: "public/mail" },
  ])
    assert.throws(() => readEmailConfig(env, "/srv/app"));
});
test("file adapter writes one encoded .eml per delivery and overwrites retries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "labora-mail-"));
  try {
    const sender = new FileEmailSender(dir, "Labora <no-reply@labora.invalid>");
    const email = {
      id,
      to: "ana@invalid.test",
      subject: "Tu incidencia fue resuelta · Pesados",
      text: "Hola Ana:",
    };
    await sender.send(email);
    await sender.send(email);
    assert.deepEqual(await readdir(dir), [`${id}.eml`]);
    const content = await readFile(join(dir, `${id}.eml`), "utf8");
    assert.match(
      content,
      /^From: Labora <no-reply@labora.invalid>\r\nTo: ana@invalid.test\r\n/,
    );
    assert.match(content, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    assert.match(content, /\r\n\r\nHola Ana:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
