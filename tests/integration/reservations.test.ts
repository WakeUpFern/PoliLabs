import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "../../src/infrastructure/database/schema";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "../../src/modules/identity/infrastructure/access-schema";
import { users } from "../../src/modules/identity/infrastructure/auth-schema";
import { INITIAL_PERMISSIONS } from "../../src/modules/identity/domain/access-catalog";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import {
  spaces,
  resources,
} from "../../src/modules/spatial/infrastructure/spatial-schema";
import {
  CancelReservation,
  CheckAvailability,
  CreateReservation,
  GetReservation,
  ListMyReservations,
} from "../../src/modules/reservations/application/reservations";
import {
  ReservationCancellationError,
  ReservationConflictError,
  ReservationInputError,
  ReservationNotFoundError,
  ReservationTargetError,
} from "../../src/modules/reservations/domain/reservation";
import { DrizzleReservationStore } from "../../src/modules/reservations/infrastructure/reservation-store";
import {
  reservations,
  reservationResources,
} from "../../src/modules/reservations/infrastructure/reservation-schema";
import { prepareIntegrationDatabase } from "./database";

function code(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error) return String(error.code);
  if ("cause" in error) return code(error.cause);
}

test("Reservations I services and PostgreSQL invariants", async (context) => {
  const pool = new Pool({
    connectionString: await prepareIntegrationDatabase(),
    max: 10,
  });
  const db = drizzle(pool, { schema });
  const suffix = randomUUID();
  const actorIds = [randomUUID(), randomUUID(), randomUUID()];
  const labIds = [randomUUID(), randomUUID()];
  const roleIds = [randomUUID(), randomUUID(), randomUUID()];
  const spaceIds = [randomUUID(), randomUUID(), randomUUID()];
  const resourceIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  try {
    await db.insert(users).values(
      actorIds.map((id, i) => ({
        id,
        name: `Reservation fixture ${i}`,
        email: `reservation-${suffix}-${i}@invalid.test`,
      })),
    );
    await db.insert(laboratories).values(
      labIds.map((id, i) => ({
        id,
        name: `Reservation lab ${i}`,
        slug: `reservation-${suffix}-${i}`,
      })),
    );
    await db.insert(roles).values(
      roleIds.map((id, i) => ({
        id,
        key: `reservation-${suffix}-${i}`,
        name: "Reservation fixture role",
        description: "Synthetic integration fixture",
      })),
    );
    await db
      .insert(permissions)
      .values([
        INITIAL_PERMISSIONS.reservationRead,
        INITIAL_PERMISSIONS.reservationCreate,
        INITIAL_PERMISSIONS.reservationCancel,
      ])
      .onConflictDoNothing();
    const catalog = await db
      .select()
      .from(permissions)
      .where(
        inArray(permissions.key, [
          "reservation.read",
          "reservation.create",
          "reservation.cancel",
        ]),
      );
    assert.equal(catalog.length, 3);
    await db
      .insert(rolePermissions)
      .values(
        roleIds.flatMap((roleId, i) =>
          catalog
            .filter(
              (p) =>
                i === 0 ||
                (i === 1
                  ? p.key === "reservation.read"
                  : p.key === "reservation.create"),
            )
            .map((p) => ({ roleId, permissionId: p.id })),
        ),
      );
    const memberships = await db
      .insert(laboratoryMemberships)
      .values([
        ...actorIds.map((userId) => ({ userId, laboratoryId: labIds[0] })),
        { userId: actorIds[0], laboratoryId: labIds[1] },
      ])
      .returning();
    await db.insert(membershipRoles).values(
      memberships.map((m, i) => ({
        membershipId: m.id,
        roleId: roleIds[i === 3 ? 1 : i],
      })),
    );
    await db.insert(spaces).values(
      spaceIds.map((id, i) => ({
        id,
        laboratoryId: labIds[i === 2 ? 1 : 0],
        name: `Reservation space ${i}`,
        slug: `space-${i}`,
      })),
    );
    await db.insert(resources).values(
      resourceIds.map((id, i) => ({
        id,
        spaceId: spaceIds[i < 2 ? 0 : i - 1],
        name: `Reservation resource ${i}`,
      })),
    );
    const store = new DrizzleReservationStore(db);
    const check = new CheckAvailability(store);
    const create = new CreateReservation(store);
    const get = new GetReservation(store);
    const list = new ListMyReservations(store);
    const cancel = new CancelReservation(store);
    const actor = { actorUserId: actorIds[0], laboratoryId: labIds[0] };
    const origin = Date.now() + 86400000;
    const time = (start: number, end: number) => ({
      startsAt: new Date(origin + start * 60000).toISOString(),
      endsAt: new Date(origin + end * 60000).toISOString(),
    });
    const request = {
      ...actor,
      spaceId: spaceIds[0],
      isExclusive: false,
      resourceIds: [resourceIds[0]],
      ...time(60, 120),
    };
    let baselineId: string;

    await context.test(
      "free availability, multi-resource create, own detail/list and idempotent cancel",
      async () => {
        assert.deepEqual(await check.execute(request), { available: true });
        const result = await create.execute({
          ...request,
          resourceIds: resourceIds.slice(0, 2),
        });
        assert.equal(result.status, "confirmed");
        assert.deepEqual(
          (await get.execute({ ...actor, reservationId: result.id }))
            .resourceIds,
          resourceIds.slice(0, 2).sort(),
        );
        assert.equal((await list.execute(actor)).length, 1);
        assert.equal((await check.execute(request)).available, false);
        const cancelled = await cancel.execute({
          ...actor,
          reservationId: result.id,
        });
        assert.equal(cancelled.status, "cancelled");
        assert.ok(cancelled.cancelledAt);
        assert.deepEqual(
          await cancel.execute({ ...actor, reservationId: result.id }),
          cancelled,
        );
        assert.equal((await check.execute(request)).available, true);
        assert.equal((await list.execute(actor))[0].status, "cancelled");
        baselineId = (await create.execute(request)).id;
        assert.equal(
          (
            await check.execute({
              ...request,
              resourceIds: resourceIds.slice(0, 2),
            })
          ).available,
          false,
        );
      },
    );

    for (const [label, start, end] of [
      ["exact", 60, 120],
      ["partial start", 30, 90],
      ["partial end", 90, 150],
      ["contained", 70, 100],
      ["containing", 30, 150],
    ] as const)
      await context.test(`rejects ${label} overlap`, async () => {
        const input = { ...request, ...time(start, end) };
        assert.equal((await check.execute(input)).available, false);
        await assert.rejects(create.execute(input), ReservationConflictError);
      });

    await context.test(
      "contiguous intervals, different resources and different spaces are available",
      async () => {
        for (const input of [
          { ...request, ...time(120, 180) },
          { ...request, ...time(0, 60) },
          { ...request, resourceIds: [resourceIds[1]] },
          { ...request, spaceId: spaceIds[1], resourceIds: [resourceIds[2]] },
        ]) {
          assert.equal((await check.execute(input)).available, true);
          await create.execute(input);
        }
      },
    );

    await context.test("invalid and past intervals rejected", async () => {
      await assert.rejects(
        async () => create.execute({ ...request, ...time(60, 60) }),
        ReservationInputError,
      );
      for (const [start, end] of [
        [-120, -60],
        [-60, 60],
      ])
        await assert.rejects(
          create.execute({
            ...request,
            startsAt: new Date(Date.now() + start * 60000).toISOString(),
            endsAt: new Date(Date.now() + end * 60000).toISOString(),
          }),
          ReservationInputError,
        );
    });

    await context.test(
      "same-space relations, lab isolation and permission ownership",
      async () => {
        for (const input of [
          { ...request, resourceIds: [resourceIds[3]] },
          { ...request, resourceIds: [resourceIds[2]] },
          {
            ...request,
            spaceId: spaceIds[2],
            isExclusive: true,
            resourceIds: [],
          },
        ])
          await assert.rejects(create.execute(input), ReservationTargetError);
        await assert.rejects(
          create.execute({ ...request, actorUserId: actorIds[1] }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          check.execute({ ...request, actorUserId: actorIds[2] }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          list.execute({ ...actor, actorUserId: actorIds[2] }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          get.execute({
            ...actor,
            actorUserId: actorIds[2],
            reservationId: baselineId,
          }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          get.execute({
            ...actor,
            actorUserId: actorIds[1],
            reservationId: baselineId,
          }),
          ReservationNotFoundError,
        );
        await assert.rejects(
          create.execute({
            ...request,
            laboratoryId: labIds[1],
            spaceId: spaceIds[2],
            resourceIds: [resourceIds[3]],
          }),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          get.execute({
            ...actor,
            laboratoryId: labIds[1],
            reservationId: baselineId,
          }),
          ReservationNotFoundError,
        );
        // Full permission holder may not cancel somebody else's reservation.
        const ownedByOther = await create.execute({
          ...request,
          actorUserId: actorIds[2],
          ...time(240, 300),
        });
        await assert.rejects(
          cancel.execute({ ...actor, reservationId: ownedByOther.id }),
          ReservationNotFoundError,
        );
        await assert.rejects(
          cancel.execute({
            ...actor,
            actorUserId: actorIds[1],
            reservationId: baselineId,
          }),
          AuthorizationDeniedError,
        );
        assert.equal(
          (await list.execute({ ...actor, laboratoryId: labIds[1] })).length,
          0,
        );
      },
    );

    await context.test(
      "inactive Space and Resource are not available or reservable; history persists",
      async () => {
        await db
          .update(resources)
          .set({ isActive: false })
          .where(eq(resources.id, resourceIds[0]));
        await assert.rejects(check.execute(request), ReservationTargetError);
        await assert.rejects(create.execute(request), ReservationTargetError);
        assert.equal(
          (await get.execute({ ...actor, reservationId: baselineId })).id,
          baselineId,
        );
        await db
          .update(resources)
          .set({ isActive: true })
          .where(eq(resources.id, resourceIds[0]));
        await db
          .update(spaces)
          .set({ isActive: false })
          .where(eq(spaces.id, spaceIds[0]));
        await assert.rejects(check.execute(request), ReservationTargetError);
        await assert.rejects(create.execute(request), ReservationTargetError);
        assert.ok((await list.execute(actor)).length);
        await db
          .update(spaces)
          .set({ isActive: true })
          .where(eq(spaces.id, spaceIds[0]));
      },
    );

    await context.test(
      "exclusive Space conflicts with resources in both creation orders",
      async () => {
        await assert.rejects(
          create.execute({ ...request, isExclusive: true, resourceIds: [] }),
          ReservationConflictError,
        );
        const exclusive = await create.execute({
          ...request,
          isExclusive: true,
          resourceIds: [],
          ...time(360, 420),
        });
        for (const resourceId of resourceIds.slice(0, 2))
          await assert.rejects(
            create.execute({
              ...request,
              resourceIds: [resourceId],
              ...time(360, 420),
            }),
            ReservationConflictError,
          );
        assert.equal(
          (
            await check.execute({
              ...request,
              isExclusive: true,
              resourceIds: [],
              ...time(360, 420),
            })
          ).available,
          false,
        );
        await cancel.execute({ ...actor, reservationId: exclusive.id });
        assert.equal(
          (await check.execute({ ...request, ...time(360, 420) })).available,
          true,
        );
      },
    );

    for (const mode of ["resource", "space", "mixed"] as const)
      await context.test(
        `simultaneous service writes: ${mode}, exactly one succeeds`,
        async () => {
          const start =
            mode === "resource" ? 480 : mode === "space" ? 600 : 720;
          const input = { ...request, ...time(start, start + 60) };
          const exclusive = { ...input, isExclusive: true, resourceIds: [] };
          const results = await Promise.allSettled([
            create.execute(mode === "space" ? exclusive : input),
            create.execute(mode === "resource" ? input : exclusive),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          const failed = results.find((r) => r.status === "rejected");
          assert.ok(failed && failed.status === "rejected");
          assert.ok(failed.reason instanceof ReservationConflictError);
          const rows = await db
            .select()
            .from(reservations)
            .where(eq(reservations.startsAt, new Date(input.startsAt)));
          assert.equal(rows.length, 1);
        },
      );

    await context.test(
      "started reservations cannot be cancelled; cancelled records retain history",
      async () => {
        const startsAt = new Date(Date.now() + 1000).toISOString();
        const endsAt = new Date(Date.now() + 60000).toISOString();
        const row = await create.execute({ ...request, startsAt, endsAt });
        const wait = new Date(startsAt).getTime() - Date.now() + 20;
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        await assert.rejects(
          cancel.execute({ ...actor, reservationId: row.id }),
          ReservationCancellationError,
        );
        assert.equal(
          (await get.execute({ ...actor, reservationId: row.id })).status,
          "confirmed",
        );
        await assert.rejects(
          db
            .update(reservations)
            .set({ status: "cancelled", cancelledAt: new Date() })
            .where(eq(reservations.id, row.id)),
          (error) => code(error) === "23514",
        );
      },
    );

    async function rawInsert(client: PoolClient, input: typeof request) {
      const id = randomUUID();
      await client.query(
        "insert into reservations (id,space_id,created_by,starts_at,ends_at,is_exclusive) values ($1,$2,$3,$4,$5,$6)",
        [
          id,
          input.spaceId,
          input.actorUserId,
          input.startsAt,
          input.endsAt,
          input.isExclusive,
        ],
      );
      for (const resourceId of input.resourceIds)
        await client.query(
          "insert into reservation_resources (reservation_id,space_id,resource_id) values ($1,$2,$3)",
          [id, input.spaceId, resourceId],
        );
      return id;
    }

    for (const mode of ["resource", "space", "mixed"] as const)
      await context.test(
        `raw SQL race with verified lock wait: ${mode}`,
        async () => {
          const first = await pool.connect();
          const second = await pool.connect();
          const start =
            mode === "resource" ? 840 : mode === "space" ? 960 : 1080;
          const input = { ...request, ...time(start, start + 60) };
          const exclusive = { ...input, isExclusive: true, resourceIds: [] };
          try {
            await first.query("begin");
            await second.query("begin");
            await rawInsert(first, mode === "space" ? exclusive : input);
            const pid = (await second.query("select pg_backend_pid() as pid"))
              .rows[0].pid;
            const competing = (async () => {
              try {
                await rawInsert(
                  second,
                  mode === "resource" ? input : exclusive,
                );
                await second.query("commit");
                return "committed";
              } catch (error) {
                await second.query("rollback");
                return code(error);
              }
            })();
            let waiting = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              const result = await pool.query(
                "select wait_event_type from pg_stat_activity where pid=$1",
                [pid],
              );
              if (result.rows[0]?.wait_event_type === "Lock") {
                waiting = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.equal(
              waiting,
              true,
              "second physical connection must wait on the first transaction",
            );
            await first.query("commit");
            assert.equal(await competing, "23P01");
            assert.equal(
              (
                await db
                  .select()
                  .from(reservations)
                  .where(eq(reservations.startsAt, new Date(input.startsAt)))
              ).length,
              1,
            );
          } finally {
            await first.query("rollback");
            await second.query("rollback");
            first.release();
            second.release();
          }
        },
      );

    await context.test(
      "database rejects invalid final shape, cross-space FK and temporal mutations",
      async () => {
        await assert.rejects(
          db.transaction(async (tx) => {
            await tx.insert(reservations).values({
              spaceId: spaceIds[0],
              createdBy: actorIds[0],
              startsAt: new Date(origin + 1200 * 60000),
              endsAt: new Date(origin + 1260 * 60000),
              isExclusive: false,
            });
          }),
          (error) => code(error) === "23514",
        );
        await assert.rejects(
          db.transaction(async (tx) => {
            const [row] = await tx
              .insert(reservations)
              .values({
                spaceId: spaceIds[0],
                createdBy: actorIds[0],
                startsAt: new Date(origin + 1200 * 60000),
                endsAt: new Date(origin + 1260 * 60000),
                isExclusive: false,
              })
              .returning();
            await tx.insert(reservationResources).values({
              reservationId: row.id,
              spaceId: row.spaceId,
              resourceId: resourceIds[3],
            });
          }),
          (error) => code(error) === "23503",
        );
        await assert.rejects(
          db
            .update(reservations)
            .set({ endsAt: new Date(origin + 1400 * 60000) })
            .where(eq(reservations.id, baselineId)),
          (error) => code(error) === "23514",
        );
        await assert.rejects(
          db.transaction(
            async (tx) => {
              await tx.insert(reservations).values({
                spaceId: spaceIds[0],
                createdBy: actorIds[0],
                startsAt: new Date(origin + 1200 * 60000),
                endsAt: new Date(origin + 1260 * 60000),
                isExclusive: true,
              });
            },
            { isolationLevel: "repeatable read" },
          ),
          (error) => code(error) === "23514",
        );
        await assert.rejects(
          db.insert(reservations).values({
            spaceId: spaceIds[0],
            createdBy: actorIds[0],
            startsAt: new Date(0),
            endsAt: new Date(1000),
            isExclusive: true,
          }),
          (error) => code(error) === "23514",
        );
        await assert.rejects(
          db.insert(reservations).values({
            spaceId: spaceIds[0],
            createdBy: actorIds[0],
            startsAt: new Date(origin),
            endsAt: new Date(origin),
            isExclusive: true,
          }),
          (error) => code(error) === "23514",
        );
        const cancelled = await cancel.execute({
          ...actor,
          reservationId: baselineId,
        });
        assert.equal(cancelled.status, "cancelled");
        await assert.rejects(
          db
            .update(reservations)
            .set({ status: "confirmed", cancelledAt: null })
            .where(eq(reservations.id, baselineId)),
          (error) => code(error) === "23514",
        );
        const rows = await db.execute(
          sql`select count(*) as count from reservations where created_by = ${actor.actorUserId} and starts_at = ${new Date(origin + 1200 * 60000)}`,
        );
        assert.equal(Number(rows.rows[0].count), 0);
      },
    );
  } finally {
    await db.transaction(async (tx) => {
      await tx
        .delete(reservationResources)
        .where(inArray(reservationResources.spaceId, spaceIds));
      await tx
        .delete(reservations)
        .where(inArray(reservations.spaceId, spaceIds));
      await tx.delete(resources).where(inArray(resources.id, resourceIds));
      await tx.delete(spaces).where(inArray(spaces.id, spaceIds));
      const memberships = await tx
        .select()
        .from(laboratoryMemberships)
        .where(inArray(laboratoryMemberships.userId, actorIds));
      if (memberships.length)
        await tx.delete(membershipRoles).where(
          inArray(
            membershipRoles.membershipId,
            memberships.map((row) => row.id),
          ),
        );
      await tx
        .delete(laboratoryMemberships)
        .where(inArray(laboratoryMemberships.userId, actorIds));
      await tx
        .delete(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds));
      await tx.delete(roles).where(inArray(roles.id, roleIds));
      await tx.delete(laboratories).where(inArray(laboratories.id, labIds));
      await tx.delete(users).where(inArray(users.id, actorIds));
    });
    await pool.end();
  }
});
