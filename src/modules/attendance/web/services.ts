import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { attendanceService } from "../infrastructure/services";
import { AttendanceWeb } from "./attendance-web";
export const attendanceWeb = new AttendanceWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  attendance: attendanceService,
});
