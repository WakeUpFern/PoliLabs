import type { AuthorizationGrant } from "@/modules/identity/application/authorization-service";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  AcademicSource,
  Practice,
  LabSession,
  MemberOption,
} from "../domain/academic";
export type AcademicContext = { actorUserId: string; laboratoryId: string };
export type PracticeDetail = { practice: Practice; sessions: LabSession[] };
export type SessionDetail = {
  session: LabSession;
  practice: Practice;
  participants: { id: string; name: string }[];
  isParticipant: boolean;
  spaceName: string;
  teacherName: string;
};
export interface AcademicSession {
  list(context: AcademicContext, manage: boolean): Promise<Practice[]>;
  practice(
    context: AcademicContext,
    id: string,
    manage: boolean,
    lock?: boolean,
  ): Promise<PracticeDetail>;
  session(
    context: AcademicContext,
    id: string,
    manage: boolean,
    lock?: boolean,
  ): Promise<SessionDetail>;
  options(context: AcademicContext): Promise<{
    spaces: { id: string; name: string }[];
    members: MemberOption[];
  }>;
  validateRelations(
    context: AcademicContext,
    values: Pick<LabSession, "spaceId" | "teacherUserId">,
    participants: readonly string[],
  ): Promise<void>;
  createPractice(
    context: AcademicContext,
    values: Pick<Practice, "title" | "instructions">,
    source: AcademicSource,
  ): Promise<Practice>;
  savePractice(
    context: AcademicContext,
    practice: Practice,
    source: AcademicSource,
  ): Promise<void>;
  createSession(
    context: AcademicContext,
    values: Omit<LabSession, "id" | "laboratoryId" | "status">,
    source: AcademicSource,
  ): Promise<LabSession>;
  saveSession(
    context: AcademicContext,
    session: LabSession,
    source: AcademicSource,
  ): Promise<void>;
  setParticipants(
    context: AcademicContext,
    session: LabSession,
    ids: readonly string[],
    source: AcademicSource,
  ): Promise<void>;
}
export interface AcademicStore {
  run<T>(
    context: AcademicContext,
    permission: PermissionKey,
    operation: (
      session: AcademicSession,
      grant: AuthorizationGrant,
    ) => Promise<T>,
  ): Promise<T>;
}
