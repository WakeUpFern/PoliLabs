import { notFound } from "next/navigation";
import { AttendanceError } from "@/modules/attendance/domain/attendance";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
export async function attendancePageData<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      (error instanceof AttendanceError &&
        ["input", "not-found", "relation"].includes(error.code))
    )
      notFound();
    throw error;
  }
}
