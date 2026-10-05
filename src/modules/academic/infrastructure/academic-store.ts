import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/infrastructure/database/schema";
import {
  AuthorizationService,
  type AuthorizationGrant,
} from "@/modules/identity/application/authorization-service";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import {
  laboratories,
  laboratoryMemberships,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from "@/modules/identity/infrastructure/access-schema";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { spaces } from "@/modules/spatial/infrastructure/spatial-schema";
import {
  AcademicError,
  academicId,
  type Practice,
  type LabSession,
  type AcademicSource,
} from "../domain/academic";
import type {
  AcademicContext,
  AcademicSession,
  AcademicStore,
} from "../application/academic-store";
import {
  practices,
  labSessions,
  sessionParticipants,
  academicEvents,
} from "./academic-schema";
type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
function postgresError(error: unknown): { code?: string } {
  if (!error || typeof error !== "object") return {};
  if ("code" in error) return error as { code: string };
  if ("cause" in error) return postgresError(error.cause);
  return {};
}
async function authorizeLocked(
  tx: Transaction,
  context: AcademicContext,
  permission: PermissionKey,
) {
  // Protect membership, actor, lab and concrete permission paths until commit.
  await tx
    .select({ id: laboratoryMemberships.id })
    .from(users)
    .innerJoin(
      laboratoryMemberships,
      and(
        eq(laboratoryMemberships.userId, users.id),
        eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
      ),
    )
    .innerJoin(
      laboratories,
      eq(laboratories.id, laboratoryMemberships.laboratoryId),
    )
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, laboratoryMemberships.id),
    )
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(
      permissions,
      and(
        eq(permissions.id, rolePermissions.permissionId),
        eq(permissions.key, permission),
      ),
    )
    .where(eq(users.id, context.actorUserId))
    .for("share");
  return new AuthorizationService(new DrizzleAuthorizationReader(tx)).authorize(
    { ...context, requiredPermission: permission },
  );
}
class DrizzleAcademicSession implements AcademicSession {
  constructor(private readonly tx: Transaction) {}
  async list(context: AcademicContext, manage: boolean) {
    return this.tx
      .select()
      .from(practices)
      .where(
        and(
          eq(practices.laboratoryId, context.laboratoryId),
          manage ? undefined : eq(practices.status, "published"),
        ),
      )
      .orderBy(asc(practices.title), asc(practices.id));
  }
  async practice(
    context: AcademicContext,
    id: string,
    manage: boolean,
    lock = false,
  ) {
    const query = this.tx
      .select()
      .from(practices)
      .where(
        and(
          eq(practices.id, id),
          eq(practices.laboratoryId, context.laboratoryId),
        ),
      );
    const [practice] = lock ? await query.for("update") : await query;
    if (!practice || (!manage && practice.status !== "published"))
      throw new AcademicError("not-found");
    const sessions = await this.tx
      .select()
      .from(labSessions)
      .where(
        and(
          eq(labSessions.practiceId, id),
          eq(labSessions.laboratoryId, context.laboratoryId),
          manage
            ? undefined
            : sql`exists(select 1 from session_participants p where p.session_id = ${labSessions.id} and p.user_id = ${context.actorUserId})`,
        ),
      )
      .orderBy(asc(labSessions.startsAt), asc(labSessions.id));
    return { practice, sessions };
  }
  async session(
    context: AcademicContext,
    id: string,
    manage: boolean,
    lock = false,
  ) {
    const condition = and(
      eq(labSessions.id, id),
      eq(labSessions.laboratoryId, context.laboratoryId),
    );
    // All academic mutations lock the practice first, including roster changes.
    // This serializes closing a practice against creation/opening of its sessions.
    if (lock) {
      const [ref] = await this.tx
        .select({ practiceId: labSessions.practiceId })
        .from(labSessions)
        .where(condition);
      if (!ref) throw new AcademicError("not-found");
      await this.practice(context, ref.practiceId, true, true);
    }
    const query = this.tx.select().from(labSessions).where(condition);
    const [session] = lock ? await query.for("update") : await query;
    if (!session) throw new AcademicError("not-found");
    const { practice } = await this.practice(context, session.practiceId, true);
    const [participation] = await this.tx
      .select({ id: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.sessionId, id),
          eq(sessionParticipants.userId, context.actorUserId),
        ),
      );
    if (!manage && (!participation || practice.status !== "published"))
      throw new AcademicError("not-found");
    const participants = manage
      ? await this.tx
          .select({ id: users.id, name: users.name })
          .from(sessionParticipants)
          .innerJoin(users, eq(users.id, sessionParticipants.userId))
          .where(
            and(
              eq(sessionParticipants.sessionId, id),
              eq(sessionParticipants.laboratoryId, context.laboratoryId),
            ),
          )
          .orderBy(asc(users.name), asc(users.id))
      : [];
    const [space] = await this.tx
      .select({ name: spaces.name })
      .from(spaces)
      .where(
        and(
          eq(spaces.id, session.spaceId),
          eq(spaces.laboratoryId, context.laboratoryId),
        ),
      );
    const [teacher] = await this.tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, session.teacherUserId));
    return {
      session,
      practice,
      participants,
      isParticipant: !!participation,
      spaceName: space.name,
      teacherName: teacher.name,
    };
  }
  async options(context: AcademicContext) {
    const spaceRows = await this.tx
      .select({ id: spaces.id, name: spaces.name })
      .from(spaces)
      .where(
        and(
          eq(spaces.laboratoryId, context.laboratoryId),
          eq(spaces.isActive, true),
        ),
      )
      .orderBy(asc(spaces.name));
    const memberRows = await this.tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(
        laboratoryMemberships,
        eq(laboratoryMemberships.userId, users.id),
      )
      .where(
        and(
          eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
          eq(laboratoryMemberships.isActive, true),
          eq(users.isActive, true),
        ),
      )
      .orderBy(asc(users.name), asc(users.id));
    const reader = new DrizzleAuthorizationReader(this.tx);
    const members = await Promise.all(
      memberRows.map(async (row) => ({
        ...row,
        canTeach:
          (
            await reader.readAuthorizationSnapshot({
              actorUserId: row.id,
              laboratoryId: context.laboratoryId,
            })
          )?.permissionKeys.includes("academic.manage") ?? false,
      })),
    );
    return { spaces: spaceRows, members };
  }
  async validateRelations(
    context: AcademicContext,
    values: Pick<LabSession, "spaceId" | "teacherUserId">,
    participants: readonly string[],
  ) {
    const [space] = await this.tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          eq(spaces.id, values.spaceId),
          eq(spaces.laboratoryId, context.laboratoryId),
          eq(spaces.isActive, true),
        ),
      )
      .for("share");
    if (!space) throw new AcademicError("relation");
    // Lock each member and user in stable order so revocations cannot race the write.
    const ids = [...new Set([values.teacherUserId, ...participants])].sort();
    for (const id of ids) {
      const [member] = await this.tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(
          laboratoryMemberships,
          eq(laboratoryMemberships.userId, users.id),
        )
        .where(
          and(
            eq(users.id, id),
            eq(users.isActive, true),
            eq(laboratoryMemberships.laboratoryId, context.laboratoryId),
            eq(laboratoryMemberships.isActive, true),
          ),
        )
        .for("share");
      if (!member) throw new AcademicError("relation");
    }
    try {
      await authorizeLocked(
        this.tx,
        { ...context, actorUserId: values.teacherUserId },
        "academic.manage",
      );
    } catch (error) {
      if (error instanceof AuthorizationDeniedError)
        throw new AcademicError("relation");
      throw error;
    }
  }
  private async audit(
    context: AcademicContext,
    practiceId: string,
    sessionId: string | null,
    action: string,
    source: AcademicSource,
    snapshot: unknown,
  ) {
    await this.tx.insert(academicEvents).values({
      laboratoryId: context.laboratoryId,
      practiceId,
      sessionId,
      actorUserId: context.actorUserId,
      action,
      source,
      snapshot,
    });
  }
  async createPractice(
    context: AcademicContext,
    values: Pick<Practice, "title" | "instructions">,
    source: AcademicSource,
  ) {
    const [row] = await this.tx
      .insert(practices)
      .values({
        ...values,
        laboratoryId: context.laboratoryId,
        createdBy: context.actorUserId,
      })
      .returning();
    await this.audit(context, row.id, null, "practice.created", source, row);
    return row;
  }
  async savePractice(
    context: AcademicContext,
    practice: Practice,
    source: AcademicSource,
  ) {
    await this.tx
      .update(practices)
      .set({
        title: practice.title,
        instructions: practice.instructions,
        status: practice.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(practices.id, practice.id),
          eq(practices.laboratoryId, context.laboratoryId),
        ),
      );
    await this.audit(
      context,
      practice.id,
      null,
      "practice.updated",
      source,
      practice,
    );
  }
  async createSession(
    context: AcademicContext,
    values: Omit<LabSession, "id" | "laboratoryId" | "status">,
    source: AcademicSource,
  ) {
    const [row] = await this.tx
      .insert(labSessions)
      .values({ ...values, laboratoryId: context.laboratoryId })
      .returning();
    await this.audit(
      context,
      row.practiceId,
      row.id,
      "session.created",
      source,
      row,
    );
    return row;
  }
  async saveSession(
    context: AcademicContext,
    session: LabSession,
    source: AcademicSource,
  ) {
    const { id, laboratoryId, practiceId, ...values } = session;
    await this.tx
      .update(labSessions)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(eq(labSessions.id, id), eq(labSessions.laboratoryId, laboratoryId)),
      );
    await this.audit(
      context,
      practiceId,
      id,
      "session.updated",
      source,
      session,
    );
  }
  async setParticipants(
    context: AcademicContext,
    session: LabSession,
    ids: readonly string[],
    source: AcademicSource,
  ) {
    const previous = await this.tx
      .select({ userId: sessionParticipants.userId })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.sessionId, session.id),
          eq(sessionParticipants.laboratoryId, context.laboratoryId),
        ),
      );
    // Replace only the membership list of this session; preserve unchanged row timestamps.
    const removed = previous
      .filter((p) => !ids.includes(p.userId))
      .map((p) => p.userId);
    if (removed.length)
      await this.tx
        .delete(sessionParticipants)
        .where(
          and(
            eq(sessionParticipants.sessionId, session.id),
            inArray(sessionParticipants.userId, removed),
          ),
        );
    const added = ids.filter((id) => !previous.some((p) => p.userId === id));
    if (added.length)
      await this.tx.insert(sessionParticipants).values(
        added.map((userId) => ({
          sessionId: session.id,
          laboratoryId: context.laboratoryId,
          userId,
        })),
      );
    await this.audit(
      context,
      session.practiceId,
      session.id,
      "participants.updated",
      source,
      { before: previous.map((p) => p.userId).sort(), after: ids },
    );
  }
}
export class DrizzleAcademicStore implements AcademicStore {
  constructor(private readonly database: Database) {}
  async run<T>(
    context: AcademicContext,
    permission: PermissionKey,
    operation: (
      session: AcademicSession,
      grant: AuthorizationGrant,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      academicId(context.actorUserId);
      academicId(context.laboratoryId);
    } catch {
      throw new AuthorizationDeniedError();
    }
    try {
      return await this.database.transaction(
        async (tx) => {
          const grant = await authorizeLocked(tx, context, permission);
          return operation(new DrizzleAcademicSession(tx), grant);
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const pg = postgresError(error);
      if (pg.code === "23503") throw new AcademicError("relation");
      if (pg.code === "23514" || pg.code === "23505")
        throw new AcademicError("input");
      throw error;
    }
  }
}
