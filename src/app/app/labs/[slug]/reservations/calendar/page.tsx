import { redirect } from "next/navigation";

// The calendar now lives in Reservaciones (ADR 0021); keep old links working.
export default async function ReservationCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (typeof value === "string") search.set(key, value);
  redirect(`/app/labs/${slug}/reservations${search.size ? `?${search}` : ""}`);
}
