import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "../src/config/database-env";
import * as schema from "../src/infrastructure/database/schema";
import { AcademicService } from "../src/modules/academic/application/academic";
import { DrizzleAcademicStore } from "../src/modules/academic/infrastructure/academic-store";
import { INITIAL_PERMISSION_LIST } from "../src/modules/identity/domain/access-catalog";
import { createBootstrapAuth } from "../src/modules/identity/infrastructure/bootstrap-auth";
import { CreateReservation } from "../src/modules/reservations/application/reservations";
import { DrizzleReservationStore } from "../src/modules/reservations/infrastructure/reservation-store";
import { localToInstant } from "../src/modules/reservations/web/time";
import { localDateTime } from "../src/modules/reservations/web/calendar";
import { FloorPlanService } from "../src/modules/spatial/application/floor-plans";
import { DrizzleFloorPlanStore } from "../src/modules/spatial/infrastructure/floor-plan-store";

// Synthetic demo laboratory for local development only: three accounts on the
// reserved .invalid domain with distinct roles, a space with a floor plan,
// a practice session and reservations. Never point this at shared data.
const LAB_SLUG = "demo-pesados";
const DOMAIN = "demo.invalid";

const ROLES = {
  responsable: {
    name: "Responsable demo",
    permissions: INITIAL_PERMISSION_LIST.map((p) => p.key as string),
  },
  profesor: {
    name: "Profesor demo",
    permissions: [
      "laboratory.read",
      "space.read",
      "space.manage",
      "location.read",
      "resource.read",
      "academic.read",
      "academic.manage",
      "attendance.manage",
      "usage.trace",
      "reservation.read",
      "reservation.create",
      "reservation.cancel",
      "incident.create",
      "incident.read",
      "incident.review",
      "maintenance.read",
      "inventory.read",
      "document.read",
    ],
  },
  alumno: {
    name: "Alumno demo",
    permissions: [
      "laboratory.read",
      "space.read",
      "location.read",
      "resource.read",
      "academic.read",
      "attendance.read",
      "attendance.checkin",
      "usage.read",
      "usage.record",
      "reservation.read",
      "reservation.create",
      "reservation.cancel",
      "incident.create",
      "incident.read",
      "inventory.loan.read",
      "document.read",
    ],
  },
} as const;

async function main() {
  loadEnvConfig(process.cwd());
  const password = process.env.DEMO_PASSWORD ?? "";
  if (password.length < 12)
    throw new Error(
      "Define DEMO_PASSWORD (12+ characters) in .env.local before seeding.",
    );
  const url = new URL(readDatabaseUrl(process.env));
  if (url.pathname.endsWith("_test"))
    throw new Error("Use the development database, not a _test database.");

  const pool = new Pool({ connectionString: url.toString(), max: 4 });
  const db = drizzle(pool, { schema });
  try {
    const [existing] = await db
      .select({ id: schema.laboratories.id })
      .from(schema.laboratories)
      .where(eq(schema.laboratories.slug, LAB_SLUG));
    if (existing) {
      console.log(`The demo laboratory "${LAB_SLUG}" already exists.`);
      return;
    }
    await db
      .insert(schema.permissions)
      .values(INITIAL_PERMISSION_LIST)
      .onConflictDoNothing();
    const catalog = await db.select().from(schema.permissions);
    const auth = createBootstrapAuth(db);
    const [lab] = await db
      .insert(schema.laboratories)
      .values({ slug: LAB_SLUG, name: "Laboratorio de Pesados (demo)" })
      .returning();

    const users: Record<keyof typeof ROLES, string> = {
      responsable: "",
      profesor: "",
      alumno: "",
    };
    for (const [key, role] of Object.entries(ROLES) as [
      keyof typeof ROLES,
      (typeof ROLES)[keyof typeof ROLES],
    ][]) {
      const email = `${key}@${DOMAIN}`;
      const [account] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email));
      users[key] =
        account?.id ??
        (
          await auth.api.signUpEmail({
            body: { name: role.name, email, password },
          })
        ).user.id;
      const [roleRow] = await db
        .insert(schema.roles)
        .values({
          key: `demo_${key}`,
          name: role.name,
          description: "Rol sintético de demostración local.",
        })
        .onConflictDoUpdate({
          target: schema.roles.key,
          set: { name: role.name },
        })
        .returning();
      await db
        .insert(schema.rolePermissions)
        .values(
          catalog
            .filter((p) =>
              (role.permissions as readonly string[]).includes(p.key),
            )
            .map((p) => ({ roleId: roleRow.id, permissionId: p.id })),
        )
        .onConflictDoNothing();
      const [membership] = await db
        .insert(schema.laboratoryMemberships)
        .values({ userId: users[key], laboratoryId: lab.id })
        .returning();
      await db
        .insert(schema.membershipRoles)
        .values({ membershipId: membership.id, roleId: roleRow.id });
    }

    const [space] = await db
      .insert(schema.spaces)
      .values({
        laboratoryId: lab.id,
        slug: "area-maquinas",
        name: "Área de máquinas",
        capacity: 20,
      })
      .returning();
    const [bench] = await db
      .insert(schema.locations)
      .values({ spaceId: space.id, name: "Banco de herramientas" })
      .returning();
    const resources = await db
      .insert(schema.resources)
      .values(
        ["Torno 1", "Torno 2", "Fresadora", "Taladro de banco"].map((name) => ({
          spaceId: space.id,
          name,
        })),
      )
      .returning();
    const byName = Object.fromEntries(resources.map((r) => [r.name, r.id]));

    const responsable = {
      actorUserId: users.responsable,
      laboratoryId: lab.id,
    };
    const plans = new FloorPlanService(new DrizzleFloorPlanStore(db));
    const plan = await plans.create({
      ...responsable,
      spaceId: space.id,
      name: "Planta baja",
      width: 20,
      height: 12,
    });
    const place = (input: Record<string, unknown>) =>
      plans.addElement({
        ...responsable,
        floorPlanId: plan.id,
        kind: "resource",
        ...input,
      } as Parameters<FloorPlanService["addElement"]>[0]);
    await place({
      targetId: byName["Torno 1"],
      x: 2,
      y: 2,
      width: 4,
      height: 2,
    });
    await place({
      targetId: byName["Torno 2"],
      x: 2,
      y: 6,
      width: 4,
      height: 2,
    });
    await place({
      targetId: byName["Fresadora"],
      x: 9,
      y: 2,
      width: 3,
      height: 3,
    });
    await place({
      targetId: byName["Taladro de banco"],
      x: 9,
      y: 7,
      width: 2,
      height: 2,
    });
    await place({
      kind: "location",
      targetId: bench.id,
      x: 15,
      y: 1,
      width: 4,
      height: 8,
    });
    await place({
      kind: "label",
      label: "Entrada",
      x: 0,
      y: 10,
      width: 3,
      height: 2,
    });

    // Tomorrow, in America/Mexico_City wall time.
    const day = localDateTime(Date.now() + 86_400_000).slice(0, 10);
    const at = (time: string) => localToInstant(`${day}T${time}`);
    const academic = new AcademicService(new DrizzleAcademicStore(db));
    const practice = await academic.createPractice({
      ...responsable,
      source: "SYSTEM",
      title: "Práctica 1: Torneado cilíndrico",
      instructions: "Instrucciones sintéticas de demostración.",
    });
    await academic.changePracticeStatus({
      ...responsable,
      source: "SYSTEM",
      practiceId: practice.id,
      status: "published",
    });
    await academic.createSession({
      ...responsable,
      source: "SYSTEM",
      practiceId: practice.id,
      spaceId: space.id,
      teacherUserId: users.profesor,
      startsAt: at("08:00"),
      endsAt: at("10:00"),
      participantUserIds: [users.alumno],
    });

    const reserve = new CreateReservation(new DrizzleReservationStore(db));
    await reserve.execute({
      actorUserId: users.profesor,
      laboratoryId: lab.id,
      spaceId: space.id,
      isExclusive: true,
      resourceIds: [],
      startsAt: at("08:00"),
      endsAt: at("10:00"),
    });
    await reserve.execute({
      actorUserId: users.alumno,
      laboratoryId: lab.id,
      spaceId: space.id,
      isExclusive: false,
      resourceIds: [byName["Torno 1"]],
      startsAt: at("12:00"),
      endsAt: at("14:00"),
    });

    console.log(`Demo laboratory "${LAB_SLUG}" created.`);
    for (const key of Object.keys(ROLES))
      console.log(`  ${key}@${DOMAIN}  (password: DEMO_PASSWORD)`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
});
