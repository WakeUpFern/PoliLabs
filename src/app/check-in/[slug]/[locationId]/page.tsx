import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/modules/identity/infrastructure/auth";
import { attendanceId } from "@/modules/attendance/domain/attendance";
export default async function CheckInEntry({
  params,
}: {
  params: Promise<{ slug: string; locationId: string }>;
}) {
  const { slug, locationId } = await params;
  let id: string;
  try {
    id = attendanceId(locationId);
  } catch {
    notFound();
  }
  const target = `/app/labs/${encodeURIComponent(slug)}/attendance?location=${encodeURIComponent(id)}`;
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? target : `/login?next=${encodeURIComponent(target)}`);
}
