import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import {
  getLaboratoryBySlug,
  memberAdministration,
} from "../infrastructure/services";
import { MembersWeb } from "./members-web";
export const membersWeb = new MembersWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  members: memberAdministration,
});
