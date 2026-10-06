import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { AttendanceService } from "../application/attendance";
import { DrizzleAttendanceStore } from "./attendance-store";
export const attendanceService = new AttendanceService(
  new DrizzleAttendanceStore(getDatabase()),
);
