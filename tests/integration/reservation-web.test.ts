import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
  ReservationNotFoundError,
  ReservationTargetError,
  ReservationCancellationError,
  ReservationConflictError,
  ReservationInputError,
} from "../../src/modules/reservations/domain/reservation";
import { DrizzleReservationStore } from "../../src/modules/reservations/infrastructure/reservation-store";
import {
  reservations,
  reservationResources,
} from "../../src/modules/reservations/infrastructure/reservation-schema";
import { prepareIntegrationDatabase } from "./database";

import {
  ReservationWeb,
  reservationActionError,
} from "../../src/modules/reservations/web/reservation-web";
import { localToInstant } from "../../src/modules/reservations/web/time";
import { AuthorizationService } from "../../src/modules/identity/application/authorization-service";
import { GetLaboratoryBySlug } from "../../src/modules/identity/application/get-laboratory-by-slug";
import { resolveSessionActor } from "../../src/modules/identity/application/resolve-session-actor";
import { AuthenticationRequiredError } from "../../src/modules/identity/domain/access-errors";
import {
  DrizzleAuthorizationReader,
  DrizzleLaboratoryReader,
} from "../../src/modules/identity/infrastructure/access-repository";
import { ListSpaces } from "../../src/modules/spatial/application/list-spaces";
import { ListResources } from "../../src/modules/spatial/application/list-resources";
import { ListLocations } from "../../src/modules/spatial/application/list-locations";
import { DrizzleSpaceRepository } from "../../src/modules/spatial/infrastructure/space-repository";
import { DrizzleSpatialOrganizationRepository } from "../../src/modules/spatial/infrastructure/spatial-organization-repository";

test("Reservations II web adapter with real authorized services", async (context) => {
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
        INITIAL_PERMISSIONS.laboratoryRead,
        INITIAL_PERMISSIONS.spaceRead,
        INITIAL_PERMISSIONS.resourceRead,
        INITIAL_PERMISSIONS.locationRead,
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
          "laboratory.read",
          "space.read",
          "resource.read",
          "location.read",
          "reservation.read",
          "reservation.create",
          "reservation.cancel",
        ]),
      );
    assert.equal(catalog.length, 7);
    await db
      .insert(rolePermissions)
      .values(
        roleIds.flatMap((roleId, i) =>
          catalog
            .filter(
              (p) =>
                i === 0 ||
                (i === 1
                  ? p.key !== "reservation.create" &&
                    p.key !== "reservation.cancel"
                  : p.key !== "reservation.read"),
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

    const authorization = new AuthorizationService(
      new DrizzleAuthorizationReader(db),
    );
    const organization = new DrizzleSpatialOrganizationRepository(db);
    let sessionActor: string | null = actorIds[0];
    const web = new ReservationWeb({
      currentActor: async () => ({
        actorUserId: resolveSessionActor(
          sessionActor ? { user: { id: sessionActor } } : null,
        ),
      }),
      laboratory: new GetLaboratoryBySlug(
        authorization,
        new DrizzleLaboratoryReader(db),
      ),
      authorization,
      spaces: new ListSpaces(authorization, new DrizzleSpaceRepository(db)),
      resources: new ListResources(authorization, organization),
      locations: new ListLocations(authorization, organization),
      availability: check,
      create,
      get,
      list,
      cancel,
    });
    const slug = `reservation-${suffix}-0`;
    const otherSlug = `reservation-${suffix}-1`;
    const futureDate = new Date(Date.now() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    function form(mode = "resources", hour = 10) {
      const data = new FormData();
      data.set("spaceId", spaceIds[0]);
      data.set("mode", mode);
      data.set("intent", "check");
      if (mode === "resources")
        resourceIds.slice(0, 2).forEach((id) => data.append("resourceIds", id));
      data.set(
        "startsLocal",
        `${futureDate}T${String(hour).padStart(2, "0")}:00`,
      );
      data.set(
        "endsLocal",
        `${futureDate}T${String(hour + 1).padStart(2, "0")}:00`,
      );
      return data;
    }
    let ownId = "";
    await context.test(
      "no session cannot list, open form/detail, submit or cancel",
      async () => {
        sessionActor = null;
        for (const operation of [
          () => web.list(slug),
          () => web.newForm(slug),
          () => web.detail(slug, randomUUID()),
          () => web.submit(slug, form()),
          () => web.cancel(slug, randomUUID()),
        ])
          await assert.rejects(operation, AuthenticationRequiredError);
        sessionActor = actorIds[0];
      },
    );
    await context.test(
      "missing reservation.read cannot obtain list or form",
      async () => {
        sessionActor = actorIds[2];
        await assert.rejects(web.list(slug), AuthorizationDeniedError);
        await assert.rejects(web.newForm(slug), AuthorizationDeniedError);
        sessionActor = actorIds[0];
      },
    );
    await context.test(
      "Space options and active Resources are scoped to the same Space",
      async () => {
        await db
          .update(resources)
          .set({ isActive: false })
          .where(eq(resources.id, resourceIds[1]));
        const data = await web.newForm(slug);
        assert.equal(data.spaces.length, 2);
        assert.deepEqual(
          data.spaces[0].id === spaceIds[0]
            ? data.spaces[0].resources.map((r) => r.id)
            : data.spaces[1].resources.map((r) => r.id),
          [resourceIds[0]],
        );
        assert.ok(
          data.spaces.every((space) =>
            space.resources.every((resource) => resource.id !== resourceIds[3]),
          ),
        );
        await db
          .update(resources)
          .set({ isActive: true })
          .where(eq(resources.id, resourceIds[1]));
      },
    );
    await context.test(
      "available query exposes only limited feedback; create multiple Resources",
      async () => {
        const data = form();
        const available = await web.submit(slug, data);
        assert.equal(available.state.status, "available");
        assert.deepEqual(Object.keys(available).sort(), ["state"]);
        data.set("intent", "create");
        ownId = (await web.submit(slug, data)).reservationId!;
        assert.ok(ownId);
        assert.equal(
          (await web.detail(slug, ownId)).reservation.resources.length,
          2,
        );
        data.set("intent", "check");
        assert.equal(
          (await web.submit(slug, data)).state.status,
          "unavailable",
        );
      },
    );
    await context.test(
      "Space-exclusive submission uses CreateReservation",
      async () => {
        const data = form("space", 12);
        data.set("intent", "create");
        const id = (await web.submit(slug, data)).reservationId!;
        const detail = await web.detail(slug, id);
        assert.equal(detail.reservation.isExclusive, true);
        assert.deepEqual(detail.reservation.resourceIds, []);
        assert.equal(detail.reservation.spaceName, "Reservation space 0");
        assert.equal(
          detail.reservation.startsAt,
          localToInstant(String(data.get("startsLocal"))),
        );
      },
    );
    await context.test(
      "tampered Resource from another Space or Laboratory fails",
      async () => {
        for (const id of resourceIds.slice(2)) {
          const data = form();
          data.set("intent", "create");
          data.set("resourceIds", id);
          await assert.rejects(web.submit(slug, data), ReservationTargetError);
        }
        const data = form("space", 14);
        data.set("spaceId", spaceIds[2]);
        data.set("intent", "create");
        await assert.rejects(web.submit(slug, data), ReservationTargetError);
      },
    );
    await context.test(
      "check then competing create produces public conflict feedback",
      async () => {
        const data = form("resources", 14);
        assert.equal((await web.submit(slug, data)).state.status, "available");
        await create.execute({
          actorUserId: actorIds[2],
          laboratoryId: labIds[0],
          spaceId: spaceIds[0],
          isExclusive: true,
          resourceIds: [],
          startsAt: localToInstant(String(data.get("startsLocal"))),
          endsAt: localToInstant(String(data.get("endsLocal"))),
        });
        data.set("intent", "create");
        await assert.rejects(web.submit(slug, data), (error) => {
          assert.ok(error instanceof ReservationConflictError);
          assert.match(
            reservationActionError(error).message,
            /ya no está disponible/,
          );
          return true;
        });
      },
    );
    await context.test(
      "list only own reservations and detail rejects somebody else's id",
      async () => {
        const rows = (await web.list(slug)).reservations;
        assert.equal(rows.length, 2);
        sessionActor = actorIds[1];
        assert.equal((await web.list(slug)).reservations.length, 0);
        await assert.rejects(web.detail(slug, ownId), ReservationNotFoundError);
        await assert.rejects(
          web.detail(slug, randomUUID()),
          ReservationNotFoundError,
        );
        sessionActor = actorIds[0];
      },
    );
    await context.test(
      "cancel preserves history and repeated cancel is idempotent",
      async () => {
        const state = await web.cancel(slug, ownId);
        assert.equal(state.status, "success");
        const first = (await web.detail(slug, ownId)).reservation;
        assert.equal(first.status, "cancelled");
        assert.ok(first.cancelledAt);
        await web.cancel(slug, ownId);
        assert.equal(
          (await web.detail(slug, ownId)).reservation.cancelledAt,
          first.cancelledAt,
        );
        assert.equal((await web.list(slug)).reservations.length, 2);
      },
    );
    await context.test("started cancel produces useful feedback", async () => {
      const startsAt = new Date(Date.now() + 1200);
      const row = await create.execute({
        ...actor,
        spaceId: spaceIds[1],
        isExclusive: true,
        resourceIds: [],
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60000).toISOString(),
      });
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, startsAt.getTime() - Date.now() + 20)),
      );
      await assert.rejects(web.cancel(slug, row.id), (error) => {
        assert.ok(error instanceof ReservationCancellationError);
        assert.match(reservationActionError(error).message, /ya inició/);
        return true;
      });
    });
    await context.test(
      "manual labSlug change cannot read or create across memberships",
      async () => {
        sessionActor = actorIds[1];
        await assert.rejects(web.list(otherSlug), AuthorizationDeniedError);
        await assert.rejects(
          web.detail(otherSlug, ownId),
          AuthorizationDeniedError,
        );
        await assert.rejects(
          web.submit(otherSlug, form()),
          AuthorizationDeniedError,
        );
        sessionActor = actorIds[0];
        await assert.rejects(
          web.detail(otherSlug, ownId),
          ReservationNotFoundError,
        );
      },
    );
    await context.test(
      "missing create/cancel permissions produce uniform feedback",
      async () => {
        sessionActor = actorIds[1];
        const data = form("space", 16);
        data.set("intent", "create");
        await assert.rejects(web.submit(slug, data), AuthorizationDeniedError);
        await assert.rejects(web.cancel(slug, ownId), AuthorizationDeniedError);
        sessionActor = actorIds[0];
      },
    );
    await context.test(
      "cancel someone else's reservation fails even with cancel permission",
      async () => {
        const other = await create.execute({
          actorUserId: actorIds[2],
          laboratoryId: labIds[0],
          spaceId: spaceIds[1],
          isExclusive: true,
          resourceIds: [],
          startsAt: localToInstant(`${futureDate}T18:00`),
          endsAt: localToInstant(`${futureDate}T19:00`),
        });
        await assert.rejects(
          web.cancel(slug, other.id),
          ReservationNotFoundError,
        );
      },
    );
    await context.test(
      "invalid wall time, reverse interval and empty Resource selection fail",
      async () => {
        const data = form();
        data.set("startsLocal", "2026-02-30T10:00");
        await assert.rejects(web.submit(slug, data), ReservationInputError);
        const reverse = form();
        reverse.set("endsLocal", String(reverse.get("startsLocal")));
        await assert.rejects(web.submit(slug, reverse), ReservationInputError);
        const empty = form();
        empty.delete("resourceIds");
        await assert.rejects(web.submit(slug, empty), ReservationInputError);
      },
    );
    await context.test(
      "Spatial visibility permissions are enforced without hiding own history",
      async () => {
        const permission = catalog.find((p) => p.key === "resource.read")!;
        await db
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, roleIds[0]),
              eq(rolePermissions.permissionId, permission.id),
            ),
          );
        try {
          const data = await web.newForm(slug);
          assert.ok(
            data.spaces.every(
              (space) =>
                !space.canReadResources && space.resources.length === 0,
            ),
          );
          await assert.rejects(
            web.submit(slug, form()),
            AuthorizationDeniedError,
          );
          assert.equal(
            (await web.detail(slug, ownId)).reservation.resources.length,
            2,
          );
        } finally {
          await db
            .insert(rolePermissions)
            .values({ roleId: roleIds[0], permissionId: permission.id });
        }
        const spacePermission = catalog.find((p) => p.key === "space.read")!;
        await db
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, roleIds[0]),
              eq(rolePermissions.permissionId, spacePermission.id),
            ),
          );
        try {
          await assert.rejects(web.newForm(slug), AuthorizationDeniedError);
          await assert.rejects(
            web.submit(slug, form("space", 20)),
            AuthorizationDeniedError,
          );
          assert.match(
            (await web.detail(slug, ownId)).reservation.spaceName,
            /fuera del catálogo visible/,
          );
        } finally {
          await db
            .insert(rolePermissions)
            .values({ roleId: roleIds[0], permissionId: spacePermission.id });
        }
      },
    );
    await context.test(
      "single Resource submission and cancellation use existing services",
      async () => {
        const data = form("resources", 20);
        data.set("resourceIds", resourceIds[0]);
        data.set("intent", "create");
        const id = (await web.submit(slug, data)).reservationId!;
        assert.deepEqual((await web.detail(slug, id)).reservation.resourceIds, [
          resourceIds[0],
        ]);
        assert.equal((await web.cancel(slug, id)).status, "success");
      },
    );
    await context.test(
      "deactivated catalog entities retain own history with explicit fallback",
      async () => {
        await db
          .update(spaces)
          .set({ isActive: false })
          .where(eq(spaces.id, spaceIds[0]));
        const detail = await web.detail(slug, ownId);
        assert.match(
          detail.reservation.spaceName,
          /fuera del catálogo visible/,
        );
        assert.equal(detail.reservation.resources.length, 2);
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
