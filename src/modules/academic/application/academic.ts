import {
  AcademicError,
  academicId,
  academicSource,
  practiceValues,
  sessionValues,
  practiceTransition,
  sessionTransition,
  requireSessionEditable,
  participantIds,
} from "../domain/academic";
import type { AcademicContext, AcademicStore } from "./academic-store";
type WriteContext = AcademicContext & { source: string };
function manager(permissionKeys: readonly string[]) {
  return permissionKeys.includes("academic.manage");
}
function protectOwnParticipation(actor: string, ids: readonly string[]) {
  if (ids.includes(actor)) throw new AcademicError("own-participation");
}
export class AcademicService {
  constructor(private readonly store: AcademicStore) {}
  list(input: AcademicContext) {
    return this.store.run(input, "academic.read", (session, grant) =>
      session.list(input, manager(grant.permissionKeys)),
    );
  }
  practice(input: AcademicContext & { practiceId: string }) {
    const id = academicId(input.practiceId);
    return this.store.run(input, "academic.read", (session, grant) =>
      session.practice(input, id, manager(grant.permissionKeys)),
    );
  }
  session(input: AcademicContext & { sessionId: string }) {
    const id = academicId(input.sessionId);
    return this.store.run(input, "academic.read", (session, grant) =>
      session.session(input, id, manager(grant.permissionKeys)),
    );
  }
  options(input: AcademicContext) {
    return this.store.run(input, "academic.manage", (session) =>
      session.options(input),
    );
  }
  createPractice(
    input: WriteContext & { title: string; instructions: string },
  ) {
    const values = practiceValues(input),
      source = academicSource(input.source);
    return this.store.run(input, "academic.manage", (session) =>
      session.createPractice(input, values, source),
    );
  }
  updatePractice(
    input: WriteContext & {
      practiceId: string;
      title: string;
      instructions: string;
    },
  ) {
    const id = academicId(input.practiceId),
      values = practiceValues(input),
      source = academicSource(input.source);
    return this.store.run(input, "academic.manage", async (session) => {
      const { practice, sessions } = await session.practice(
        input,
        id,
        true,
        true,
      );
      if (practice.status === "closed") throw new AcademicError("state");
      // A manager who participates cannot alter the instructions for their own sessions.
      for (const row of sessions) {
        const detail = await session.session(input, row.id, true);
        if (detail.isParticipant) throw new AcademicError("own-participation");
      }
      await session.savePractice(input, { ...practice, ...values }, source);
    });
  }
  changePracticeStatus(
    input: WriteContext & { practiceId: string; status: string },
  ) {
    const id = academicId(input.practiceId),
      source = academicSource(input.source);
    return this.store.run(input, "academic.manage", async (session) => {
      const { practice, sessions } = await session.practice(
        input,
        id,
        true,
        true,
      );
      for (const row of sessions)
        if ((await session.session(input, row.id, true)).isParticipant)
          throw new AcademicError("own-participation");
      const status = practiceTransition(practice.status, input.status);
      if (
        status === "closed" &&
        sessions.some((s) => s.status === "scheduled" || s.status === "open")
      )
        throw new AcademicError("state");
      await session.savePractice(input, { ...practice, status }, source);
    });
  }
  createSession(
    input: WriteContext & {
      practiceId: string;
      spaceId: string;
      teacherUserId: string;
      startsAt: string;
      endsAt: string;
      participantUserIds: readonly string[];
    },
  ) {
    const practiceId = academicId(input.practiceId),
      values = sessionValues(input),
      ids = participantIds(input.participantUserIds),
      source = academicSource(input.source);
    protectOwnParticipation(input.actorUserId.toLowerCase(), ids);
    return this.store.run(input, "academic.manage", async (session) => {
      const { practice } = await session.practice(
        input,
        practiceId,
        true,
        true,
      );
      if (practice.status !== "published") throw new AcademicError("state");
      await session.validateRelations(input, values, ids);
      const row = await session.createSession(
        input,
        { ...values, practiceId },
        source,
      );
      await session.setParticipants(input, row, ids, source);
      return row;
    });
  }
  updateSession(
    input: WriteContext & {
      sessionId: string;
      spaceId: string;
      teacherUserId: string;
      startsAt: string;
      endsAt: string;
    },
  ) {
    const id = academicId(input.sessionId),
      values = sessionValues(input),
      source = academicSource(input.source);
    return this.store.run(input, "academic.manage", async (session) => {
      const detail = await session.session(input, id, true, true);
      if (detail.isParticipant) throw new AcademicError("own-participation");
      requireSessionEditable(detail.session.status);
      if (detail.practice.status !== "published")
        throw new AcademicError("state");
      await session.validateRelations(input, values, []);
      await session.saveSession(
        input,
        { ...detail.session, ...values },
        source,
      );
    });
  }
  changeSessionStatus(
    input: WriteContext & { sessionId: string; status: string },
  ) {
    const id = academicId(input.sessionId),
      source = academicSource(input.source);
    return this.store.run(input, "academic.manage", async (session) => {
      const detail = await session.session(input, id, true, true);
      if (detail.isParticipant) throw new AcademicError("own-participation");
      if (detail.practice.status !== "published")
        throw new AcademicError("state");
      const status = sessionTransition(detail.session.status, input.status);
      if (status === "open")
        await session.validateRelations(
          input,
          detail.session,
          detail.participants.map((p) => p.id),
        );
      await session.saveSession(input, { ...detail.session, status }, source);
    });
  }
  setParticipants(
    input: WriteContext & {
      sessionId: string;
      participantUserIds: readonly string[];
    },
  ) {
    const id = academicId(input.sessionId),
      ids = participantIds(input.participantUserIds),
      source = academicSource(input.source);
    protectOwnParticipation(input.actorUserId.toLowerCase(), ids);
    return this.store.run(input, "academic.manage", async (session) => {
      const detail = await session.session(input, id, true, true);
      if (detail.isParticipant) throw new AcademicError("own-participation");
      requireSessionEditable(detail.session.status);
      await session.validateRelations(input, detail.session, ids);
      await session.setParticipants(input, detail.session, ids, source);
    });
  }
}
