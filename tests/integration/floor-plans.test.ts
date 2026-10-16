import { test } from "node:test";
import assert from "node:assert/strict";
import { FloorPlanService } from "../../src/modules/spatial/application/floor-plans";
import { FloorPlanError } from "../../src/modules/spatial/domain/floor-plan";
import { DrizzleFloorPlanStore } from "../../src/modules/spatial/infrastructure/floor-plan-store";
import {
  CancelReservation,
  CreateReservation,
  ListSpaceOccupancy,
} from "../../src/modules/reservations/application/reservations";
import {
  ReservationInputError,
  ReservationTargetError,
} from "../../src/modules/reservations/domain/reservation";
import { DrizzleReservationStore } from "../../src/modules/reservations/infrastructure/reservation-store";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { operationFixture, pgCode, eq } from "./operation-fixture";

const rejected = (code: string) => (error: unknown) =>
  error instanceof FloorPlanError && error.code === code;

test("Spatial III floor plans and Reservations III occupancy in PostgreSQL", async (t) => {
  const f = await operationFixture();
  const { db, schema, pool, actor, student, spaceRows, resourceRows } = f;
  const locations = f.locationRows;
  const plans = new FloorPlanService(new DrizzleFloorPlanStore(db));
  const store = new DrizzleReservationStore(db);
  const create = new CreateReservation(store);
  const cancel = new CancelReservation(store);
  const occupancy = new ListSpaceOccupancy(store);
  const manager = {
    actorUserId: actor.actorUserId,
    laboratoryId: actor.laboratoryId,
  };
  const learner = {
    actorUserId: student.actorUserId,
    laboratoryId: student.laboratoryId,
  };
  const box = { x: 1, y: 1, width: 2, height: 2 };
  try {
    let planId = "";
    let resourceElementId = "";

    await t.test("plans reuse space.read and space.manage", async () => {
      const plan = await plans.create({
        ...manager,
        spaceId: spaceRows[0].id,
        name: " Planta baja ",
        width: "10",
        height: 6,
      });
      planId = plan.id;
      assert.deepEqual(
        { name: plan.name, width: plan.width, height: plan.height },
        { name: "Planta baja", width: 10, height: 6 },
      );
      const listed = await plans.list({ ...manager, spaceId: spaceRows[0].id });
      assert.deepEqual(
        listed.plans.map((p) => p.id),
        [planId],
      );
      assert.equal(listed.canManage, true);
      // The student role has neither space.read nor space.manage.
      await assert.rejects(
        async () => plans.list({ ...learner, spaceId: spaceRows[0].id }),
        AuthorizationDeniedError,
      );
      await assert.rejects(
        async () =>
          plans.create({
            ...learner,
            spaceId: spaceRows[0].id,
            name: "X",
            width: 2,
            height: 2,
          }),
        AuthorizationDeniedError,
      );
      for (const input of [
        { name: "", width: 5, height: 5 },
        { name: "A", width: 0, height: 5 },
        { name: "A", width: 101, height: 5 },
        { name: "A", width: "2.5", height: 5 },
      ])
        await assert.rejects(
          async () =>
            plans.create({ ...manager, spaceId: spaceRows[0].id, ...input }),
          rejected("input"),
        );
    });

    await t.test("plans stay inside their laboratory", async () => {
      // The same user is a manager of the other laboratory too.
      const other = { ...manager, laboratoryId: f.labIds[1] };
      await assert.rejects(
        async () => plans.get({ ...other, floorPlanId: planId }),
        rejected("not-found"),
      );
      await assert.rejects(
        async () => plans.list({ ...other, spaceId: spaceRows[0].id }),
        rejected("not-found"),
      );
      await assert.rejects(
        async () =>
          plans.create({
            ...other,
            spaceId: spaceRows[0].id,
            name: "X",
            width: 2,
            height: 2,
          }),
        rejected("not-found"),
      );
    });

    await t.test(
      "elements reference the plan's own space and fit it",
      async () => {
        const resource = await plans.addElement({
          ...manager,
          floorPlanId: planId,
          kind: "resource",
          targetId: resourceRows[0].id,
          ...box,
        });
        resourceElementId = resource.id;
        await plans.addElement({
          ...manager,
          floorPlanId: planId,
          kind: "location",
          targetId: locations[0].id,
          x: 4,
          y: 0,
          width: 3,
          height: 2,
        });
        await plans.addElement({
          ...manager,
          floorPlanId: planId,
          kind: "label",
          label: "Puerta",
          x: 0,
          y: 5,
          width: 2,
          height: 1,
        });
        const { elements } = await plans.get({
          ...manager,
          floorPlanId: planId,
        });
        assert.deepEqual(elements.map((e) => e.kind).sort(), [
          "label",
          "location",
          "resource",
        ]);
        await assert.rejects(
          async () =>
            plans.addElement({
              ...manager,
              floorPlanId: planId,
              kind: "resource",
              targetId: resourceRows[0].id,
              x: 6,
              y: 3,
              width: 1,
              height: 1,
            }),
          rejected("duplicate"),
        );
        await assert.rejects(
          async () =>
            plans.addElement({
              ...manager,
              floorPlanId: planId,
              kind: "resource",
              targetId: resourceRows[1].id,
              ...box,
            }),
          rejected("reference"),
        );
        await assert.rejects(
          async () =>
            plans.addElement({
              ...manager,
              floorPlanId: planId,
              kind: "location",
              targetId: locations[1].id,
              ...box,
            }),
          rejected("reference"),
        );
        await assert.rejects(
          async () =>
            plans.addElement({
              ...manager,
              floorPlanId: planId,
              kind: "label",
              label: "Muro",
              x: 9,
              y: 0,
              width: 2,
              height: 1,
            }),
          rejected("bounds"),
        );
        await assert.rejects(
          async () =>
            plans.moveElement({
              ...manager,
              floorPlanId: planId,
              elementId: resourceElementId,
              x: 0,
              y: 5,
              width: 1,
              height: 2,
            }),
          rejected("bounds"),
        );
        const moved = await plans.moveElement({
          ...manager,
          floorPlanId: planId,
          elementId: resourceElementId,
          x: 7,
          y: 3,
          width: 3,
          height: 3,
        });
        assert.deepEqual([moved.x, moved.y], [7, 3]);
        await assert.rejects(
          async () =>
            plans.update({
              ...manager,
              floorPlanId: planId,
              name: "Planta",
              width: 9,
              height: 6,
            }),
          rejected("bounds"),
        );
        const resized = await plans.update({
          ...manager,
          floorPlanId: planId,
          name: "Planta",
          width: 12,
          height: 6,
        });
        assert.equal(resized.width, 12);
      },
    );

    await t.test(
      "PostgreSQL enforces same-space references and bounds",
      async () => {
        const insert = (values: Record<string, unknown>) =>
          db.insert(schema.floorPlanElements).values({
            floorPlanId: planId,
            spaceId: spaceRows[0].id,
            kind: "label",
            label: "SQL",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            ...values,
          });
        await assert.rejects(
          insert({
            kind: "resource",
            label: null,
            resourceId: resourceRows[1].id,
          }),
          (error) => pgCode(error) === "23503",
        );
        await assert.rejects(
          insert({ spaceId: spaceRows[1].id }),
          (error) => pgCode(error) === "23503",
        );
        await assert.rejects(
          insert({ x: 11, width: 2 }),
          (error) => pgCode(error) === "23514",
        );
        await assert.rejects(
          insert({ kind: "resource", resourceId: resourceRows[0].id }),
          (error) => pgCode(error) === "23514",
        );
        await assert.rejects(
          db
            .update(schema.floorPlans)
            .set({ width: 5 })
            .where(eq(schema.floorPlans.id, planId)),
          (error) => pgCode(error) === "23514",
        );
      },
    );

    await t.test(
      "occupancy hides other users' identity and feeds the plan",
      async () => {
        const start = new Date(Date.now() + 3 * 86_400_000);
        start.setUTCMinutes(0, 0, 0);
        const at = (hours: number) =>
          new Date(start.getTime() + hours * 3_600_000).toISOString();
        const mine = await create.execute({
          ...learner,
          spaceId: spaceRows[0].id,
          isExclusive: false,
          resourceIds: [resourceRows[0].id],
          startsAt: at(0),
          endsAt: at(2),
        });
        const cancelled = await create.execute({
          ...learner,
          spaceId: spaceRows[0].id,
          isExclusive: true,
          resourceIds: [],
          startsAt: at(5),
          endsAt: at(6),
        });
        await cancel.execute({ ...learner, reservationId: cancelled.id });
        const window = {
          spaceId: spaceRows[0].id,
          startsAt: at(-1),
          endsAt: at(24),
        };
        const seenByManager = await occupancy.execute({
          ...manager,
          ...window,
        });
        assert.equal(seenByManager.length, 1);
        assert.deepEqual(
          {
            reservationId: seenByManager[0].reservationId,
            isMine: seenByManager[0].isMine,
            resourceIds: seenByManager[0].resourceIds,
          },
          {
            reservationId: null,
            isMine: false,
            resourceIds: [resourceRows[0].id],
          },
        );
        assert.equal("createdBy" in seenByManager[0], false);
        const seenByOwner = await occupancy.execute({ ...learner, ...window });
        assert.equal(seenByOwner[0].reservationId, mine.id);
        assert.equal(seenByOwner[0].isMine, true);
        // Boundaries are [start, end): a window ending at the start is empty.
        assert.equal(
          (await occupancy.execute({ ...manager, ...window, endsAt: at(0) }))
            .length,
          0,
        );
        await assert.rejects(
          async () =>
            occupancy.execute({ ...manager, ...window, endsAt: at(43 * 24) }),
          ReservationInputError,
        );
        await assert.rejects(
          async () =>
            occupancy.execute({
              ...manager,
              ...window,
              spaceId: spaceRows[2].id,
            }),
          ReservationTargetError,
        );
      },
    );

    await t.test(
      "inactive references are hidden and plans deactivate logically",
      async () => {
        await db
          .update(schema.resources)
          .set({ isActive: false })
          .where(eq(schema.resources.id, resourceRows[0].id));
        const { elements } = await plans.get({
          ...manager,
          floorPlanId: planId,
        });
        assert.equal(
          elements.some((e) => e.kind === "resource"),
          false,
        );
        await plans.removeElement({
          ...manager,
          floorPlanId: planId,
          elementId: resourceElementId,
        });
        await assert.rejects(
          async () =>
            plans.removeElement({
              ...manager,
              floorPlanId: planId,
              elementId: resourceElementId,
            }),
          rejected("not-found"),
        );
        await plans.deactivate({ ...manager, floorPlanId: planId });
        await assert.rejects(
          async () => plans.get({ ...manager, floorPlanId: planId }),
          rejected("not-found"),
        );
        assert.equal(
          (await plans.list({ ...manager, spaceId: spaceRows[0].id })).plans
            .length,
          0,
        );
        const [row] = await db
          .select({ active: schema.floorPlans.isActive })
          .from(schema.floorPlans)
          .where(eq(schema.floorPlans.id, planId));
        assert.equal(row.active, false);
      },
    );
  } finally {
    await f.cleanup();
  }
  void pool;
});
