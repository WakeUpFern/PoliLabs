"use server";
import { revalidatePath } from "next/cache";
import { attendanceWeb } from "@/modules/attendance/web/services";
import {
  attendanceActionError,
  type AttendanceActionState,
  type AttendanceOperation,
} from "@/modules/attendance/web/attendance-web";
export async function attendanceAction(
  slug: string,
  operation: AttendanceOperation,
  _previous: AttendanceActionState,
  form: FormData,
): Promise<AttendanceActionState> {
  try {
    await attendanceWeb.submit(slug, operation, form);
  } catch (error) {
    return attendanceActionError(error);
  }
  revalidatePath(`/app/labs/${slug}`, "layout");
  return {
    status: "success",
    message:
      operation === "checkin"
        ? "Asistencia registrada."
        : "Asistencia guardada con historial.",
  };
}
