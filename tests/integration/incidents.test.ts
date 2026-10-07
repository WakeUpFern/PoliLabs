import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/infrastructure/database/schema";
import { IncidentService } from "../../src/modules/incidents/application/incidents";
import { DrizzleIncidentStore } from "../../src/modules/incidents/infrastructure/incident-store";
import { IncidentError } from "../../src/modules/incidents/domain/incidents";
import { IncidentsWeb } from "../../src/modules/incidents/web/incidents-web";
import { UsageService } from "../../src/modules/usage/application/usage";
import { DrizzleUsageStore } from "../../src/modules/usage/infrastructure/usage-store";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { operationFixture } from "./operation-fixture";

test("Incidents I PostgreSQL authorization, historical context, transitions and trace", async (t) => {
  const f = await operationFixture();
  const {
    db,
    actor,
    student,
    spaceRows,
    resourceRows,
    userIds,
    labIds,
    roleIds,
  } = f;
  const service = new IncidentService(new DrizzleIncidentStore(db));
  const usage = new UsageService(new DrizzleUsageStore(db));
  const report = (overrides = {}) =>
    service.report({
      ...student,
      targetKind: "resource",
      targetId: resourceRows[0].id,
      description: "Fuga observada",
      severity: "high",
      ...overrides,
    });
  const manage = (
    id: string,
    next: string,
    version: number,
    note = "Revisión documentada",
  ) =>
    service.transition({
      ...actor,
      incidentId: id,
      next,
      expectedVersion: version,
      note,
    });
  try {
    await t.test(
      "resource and space reports do not require a practice, reservation or usage",
      async () => {
        const r = await report();
        assert.equal(r.usageId, null);
        assert.equal(r.sessionId, null);
        assert.equal(r.reportedBy, student.actorUserId);
        assert.equal(r.status, "open");
        const s = await report({
          targetKind: "space",
          targetId: spaceRows[0].id,
        });
        assert.equal(s.resourceId, null);
        assert.equal(s.targetSnapshot.name, "Room A");
        assert.equal(
          (await db.select().from(schema.resourceUsage)).filter(
            (u) => u.userId === student.actorUserId,
          ).length,
          0,
        );
        const [event] = await db
          .select()
          .from(schema.incidentEvents)
          .where(eq(schema.incidentEvents.incidentId, r.id));
        assert.equal(event.actorUserId, student.actorUserId);
        assert.equal(event.source, "WEB");
      },
    );
    await t.test(
      "session targets are limited to own participants or authorized academic managers, independent of clock",
      async () => {
        const s = await f.session();
        const r = await report({ targetKind: "session", targetId: s.id });
        assert.equal(r.sessionId, s.id);
        const outside = await f.session(spaceRows[0].id, [userIds[2]]);
        await assert.rejects(
          report({ targetKind: "session", targetId: outside.id }),
          { code: "not-found" },
        );
        const options = await service.options(student);
        assert.ok(options.targets.some((o) => o.id === s.id));
        assert.ok(!options.targets.some((o) => o.id === outside.id));
        const staff = await service.report({
          ...actor,
          targetKind: "session",
          targetId: outside.id,
          description: "Problema de sesión",
          severity: "low",
        });
        assert.equal(staff.sessionId, outside.id);
        await f.academic.changeSessionStatus({
          ...actor,
          sessionId: s.id,
          status: "cancelled",
        });
        const after = await report({ targetKind: "session", targetId: s.id });
        assert.equal(after.sessionId, s.id);
      },
    );
    await t.test(
      "own and laboratory reads have distinct permissions and do not expose foreign reports",
      async () => {
        const r = await report();
        const third = { ...student, actorUserId: userIds[2] };
        assert.ok(
          !(await service.list({ ...third, scope: "own" })).some(
            (i) => i.id === r.id,
          ),
        );
        await assert.rejects(
          service.detail({ ...third, incidentId: r.id, scope: "own" }),
          { code: "not-found" },
        );
        await assert.rejects(
          service.list({ ...student, scope: "laboratory" }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          service.transition({
            ...student,
            incidentId: r.id,
            next: "in_review",
            expectedVersion: 1,
            note: "Intento",
          }),
          AuthorizationDeniedError,
        );
        assert.ok(
          (await service.list({ ...actor, scope: "laboratory" })).some(
            (i) => i.id === r.id,
          ),
        );
        const otherLab = { ...actor, laboratoryId: labIds[1] };
        await assert.rejects(
          service.detail({
            ...otherLab,
            incidentId: r.id,
            scope: "laboratory",
          }),
          { code: "not-found" },
        );
        await assert.rejects(
          service.report({
            ...student,
            targetKind: "resource",
            targetId: resourceRows[2].id,
            description: "Otro laboratorio",
            severity: "low",
          }),
          { code: "not-found" },
        );
        await assert.rejects(
          service.report({
            ...otherLab,
            targetKind: "space",
            targetId: spaceRows[0].id,
            description: "Otro espacio",
            severity: "low",
          }),
          { code: "not-found" },
        );
      },
    );
    await t.test(
      "context snapshots survive resource movement, rename and deactivation",
      async () => {
        await db
          .update(schema.resources)
          .set({ locationId: f.locationRows[0].id })
          .where(eq(schema.resources.id, resourceRows[0].id));
        const r = await report();
        await db
          .update(schema.resources)
          .set({ locationId: null, name: "Renamed", isActive: false })
          .where(eq(schema.resources.id, resourceRows[0].id));
        const detail = await service.detail({
          ...student,
          incidentId: r.id,
          scope: "own",
        });
        assert.equal(detail.incident.targetSnapshot.name, "Machine");
        assert.equal(detail.incident.targetSnapshot.locationName, "Mesa F");
        await assert.rejects(report(), { code: "not-found" });
        await manage(r.id, "in_review", 1);
        const resolved = await manage(
          r.id,
          "resolved",
          2,
          "Verificado y corregido",
        );
        assert.equal(resolved.status, "resolved");
        await db
          .update(schema.resources)
          .set({ name: "Machine", isActive: true, locationId: null })
          .where(eq(schema.resources.id, resourceRows[0].id));
      },
    );
    await t.test(
      "review and resolution persist notes, actors, timestamps and optimistic version",
      async () => {
        const r = await report();
        await assert.rejects(manage(r.id, "resolved", 1), { code: "state" });
        assert.throws(() => manage(r.id, "in_review", 1, " "), IncidentError);
        const review = await manage(r.id, "in_review", 1);
        assert.equal(review.version, 2);
        assert.equal(review.resolvedAt, null);
        await assert.rejects(manage(r.id, "resolved", 1), { code: "conflict" });
        const resolved = await manage(
          r.id,
          "resolved",
          2,
          "Se reemplazó el cable",
        );
        assert.equal(resolved.resolution, "Se reemplazó el cable");
        assert.ok(resolved.resolvedAt! >= resolved.createdAt);
        await assert.rejects(manage(r.id, "in_review", 3), { code: "state" });
        const detail = await service.detail({
          ...student,
          incidentId: r.id,
          scope: "own",
        });
        assert.equal(detail.events.length, 3);
        assert.equal(detail.events[2].actorUserId, actor.actorUserId);
        assert.equal(detail.events[2].note, "Se reemplazó el cable");
        await assert.rejects(
          db
            .update(schema.incidentEvents)
            .set({ note: "Reescrito" })
            .where(eq(schema.incidentEvents.id, detail.events[0].id)),
        );
      },
    );
    await t.test(
      "concurrent transitions commit once and reject the stale version without extra events",
      async () => {
        const r = await report();
        const results = await Promise.allSettled([
          manage(r.id, "in_review", 1, "Gestor A"),
          manage(r.id, "in_review", 1, "Gestor B"),
        ]);
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        const failed = results.find(
          (x) => x.status === "rejected",
        ) as PromiseRejectedResult;
        assert.equal(failed.reason.code, "conflict");
        const d = await service.detail({
          ...actor,
          incidentId: r.id,
          scope: "laboratory",
        });
        assert.equal(d.events.length, 2);
        assert.equal(d.incident.version, 2);
      },
    );
    await t.test(
      "usage association validates ownership, resource and an active record at write time",
      async () => {
        const s = await f.session();
        await f.academic.changeSessionStatus({
          ...actor,
          sessionId: s.id,
          status: "open",
        });
        const u = await usage.start({
          ...student,
          kind: "academic",
          contextId: s.id,
          resourceId: resourceRows[0].id,
        });
        const r = await report({ usageId: u.id });
        assert.equal(r.usageId, u.id);
        assert.ok(
          !(await service.trace({ ...actor, incidentId: r.id })).some(
            (previous) => previous.id === u.id,
          ),
        );
        const d = await service.detail({
          ...student,
          incidentId: r.id,
          scope: "own",
        });
        assert.equal(d.relatedUsage!.sessionId, s.id);
        await assert.rejects(
          report({ usageId: u.id, targetId: resourceRows[1].id }),
          { code: "relation" },
        );
        await assert.rejects(
          report({ usageId: u.id, actorUserId: userIds[2] }),
          { code: "relation" },
        );
        await usage.finish({ ...student, usageId: u.id });
        await assert.rejects(report({ usageId: u.id }), { code: "relation" });
        assert.equal((await report()).usageId, null);
      },
    );
    await t.test(
      "report and finish races never associate a usage already finished at report time",
      async () => {
        const session = await f.session(spaceRows[1].id);
        await f.academic.changeSessionStatus({
          ...actor,
          sessionId: session.id,
          status: "open",
        });
        const u = await usage.start({
          ...student,
          kind: "academic",
          contextId: session.id,
          resourceId: resourceRows[1].id,
        });
        const count = (await service.list({ ...student, scope: "own" })).length;
        const [reported, finished] = await Promise.allSettled([
          report({ targetId: resourceRows[1].id, usageId: u.id }),
          usage.finish({ ...student, usageId: u.id }),
        ]);
        assert.equal(finished.status, "fulfilled");
        const end = (
          finished as PromiseFulfilledResult<{ endedAt: Date | null }>
        ).value.endedAt!;
        if (reported.status === "fulfilled") {
          assert.equal(reported.value.usageId, u.id);
          assert.ok(reported.value.createdAt <= end);
          assert.equal(
            (await service.list({ ...student, scope: "own" })).length,
            count + 1,
          );
        } else {
          assert.equal(reported.reason.code, "relation");
          assert.equal(
            (await service.list({ ...student, scope: "own" })).length,
            count,
          );
        }
      },
    );
    await t.test(
      "reservation usage outside classes can be associated without a session",
      async () => {
        const now = Date.now();
        const [reservation] = await db
          .insert(schema.reservations)
          .values({
            spaceId: spaceRows[1].id,
            createdBy: student.actorUserId,
            startsAt: new Date(now + 500),
            endsAt: new Date(now + 60000),
            isExclusive: true,
            status: "confirmed",
          })
          .returning();
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, now + 510 - Date.now())),
        );
        const u = await usage.start({
          ...student,
          kind: "reservation",
          contextId: reservation.id,
          resourceId: resourceRows[1].id,
        });
        const r = await report({ targetId: resourceRows[1].id, usageId: u.id });
        const d = await service.detail({
          ...student,
          incidentId: r.id,
          scope: "own",
        });
        assert.equal(d.relatedUsage!.reservationId, reservation.id);
        assert.equal(d.relatedUsage!.sessionId, null);
        await usage.finish({ ...student, usageId: u.id });
      },
    );
    await t.test(
      "trace includes multiple overlapping prior usages, excludes associated and post-report starts",
      async () => {
        const before = new Date(Date.now() - 60000),
          end = new Date(Date.now() - 30000);
        const res = await f.session(spaceRows[0].id, [userIds[1], userIds[2]]);
        await f.academic.changeSessionStatus({
          ...actor,
          sessionId: res.id,
          status: "open",
        });
        const rows = await db
          .insert(schema.resourceUsage)
          .values([
            {
              userId: userIds[1],
              resourceId: resourceRows[0].id,
              spaceId: spaceRows[0].id,
              sessionId: res.id,
              startedAt: before,
              endedAt: end,
            },
            {
              userId: userIds[2],
              resourceId: resourceRows[0].id,
              spaceId: spaceRows[0].id,
              sessionId: res.id,
              startedAt: before,
              endedAt: null,
            },
          ])
          .returning();
        const r = await report();
        const [future] = await db
          .insert(schema.resourceUsage)
          .values({
            userId: userIds[1],
            resourceId: resourceRows[0].id,
            spaceId: spaceRows[0].id,
            sessionId: res.id,
            startedAt: new Date(r.createdAt.getTime() + 60000),
            endedAt: new Date(r.createdAt.getTime() + 70000),
          })
          .returning();
        const trace = await service.trace({ ...actor, incidentId: r.id });
        assert.ok(rows.every((row) => trace.some((u) => u.id === row.id)));
        assert.ok(!trace.some((u) => u.id === future.id));
        await assert.rejects(
          service.trace({ ...student, incidentId: r.id }),
          AuthorizationDeniedError,
        );
        const [permission] = await db
          .select()
          .from(schema.permissions)
          .where(eq(schema.permissions.key, "usage.trace"));
        await db
          .delete(schema.rolePermissions)
          .where(
            and(
              eq(schema.rolePermissions.roleId, roleIds[0]),
              eq(schema.rolePermissions.permissionId, permission.id),
            ),
          );
        await assert.rejects(
          service.trace({ ...actor, incidentId: r.id }),
          AuthorizationDeniedError,
        );
        await db
          .insert(schema.rolePermissions)
          .values({ roleId: roleIds[0], permissionId: permission.id });
      },
    );
    await t.test(
      "PostgreSQL rejects cross-lab, wrong-resource usage, invalid target and missing resolution",
      async () => {
        const base = {
          laboratoryId: labIds[0],
          targetKind: "resource" as const,
          spaceId: spaceRows[0].id,
          resourceId: resourceRows[0].id,
          reportedBy: userIds[1],
          description: "Database check",
          severity: "low" as const,
          targetSnapshot: {
            name: "Machine",
            spaceName: "Room A",
            locationId: null,
            locationName: null,
          },
        };
        for (const values of [
          { ...base, laboratoryId: labIds[1] },
          { ...base, resourceId: resourceRows[2].id },
          { ...base, targetKind: "session" as const },
          { ...base, status: "resolved" as const },
        ])
          await assert.rejects(
            db.insert(schema.incidentReports).values(values),
          );
        const [u] = await db
          .select()
          .from(schema.resourceUsage)
          .where(eq(schema.resourceUsage.resourceId, resourceRows[1].id))
          .limit(1);
        await assert.rejects(
          db.insert(schema.incidentReports).values({ ...base, usageId: u.id }),
        );
      },
    );
    await t.test(
      "revoked membership blocks new reports, reads and management while preserving data",
      async () => {
        const r = await report();
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: false })
          .where(
            and(
              eq(schema.laboratoryMemberships.userId, student.actorUserId),
              eq(schema.laboratoryMemberships.laboratoryId, labIds[0]),
            ),
          );
        await assert.rejects(report(), AuthorizationDeniedError);
        await assert.rejects(
          service.detail({ ...student, incidentId: r.id, scope: "own" }),
          AuthorizationDeniedError,
        );
        assert.ok(
          (await service.list({ ...actor, scope: "laboratory" })).some(
            (i) => i.id === r.id,
          ),
        );
        await db
          .update(schema.laboratoryMemberships)
          .set({ isActive: true })
          .where(
            and(
              eq(schema.laboratoryMemberships.userId, student.actorUserId),
              eq(schema.laboratoryMemberships.laboratoryId, labIds[0]),
            ),
          );
      },
    );
    await t.test(
      "web input cannot impersonate reporter or audit origin",
      async () => {
        const web = new IncidentsWeb({
          currentActor: async () => ({ actorUserId: student.actorUserId }),
          laboratory: {
            execute: async () => ({
              id: labIds[0],
              name: "Test",
              slug: "test",
              roleKeys: [],
            }),
          },
          incidents: service,
        });
        const form = new FormData();
        form.set("target", `resource:${resourceRows[0].id}`);
        form.set("description", "Reporte desde web");
        form.set("severity", "low");
        form.set("reportedBy", actor.actorUserId);
        form.set("source", "AGENT");
        const r = await web.submit("test", "report", form);
        const d = await service.detail({
          ...student,
          incidentId: r.id,
          scope: "own",
        });
        assert.equal(r.reportedBy, student.actorUserId);
        assert.equal(d.events[0].source, "WEB");
        await assert.rejects(
          service.detail({
            ...actor,
            incidentId: randomUUID(),
            scope: "laboratory",
          }),
          { code: "not-found" },
        );
      },
    );
  } finally {
    await f.cleanup();
  }
});
