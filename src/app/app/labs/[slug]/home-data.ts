import "server-only";
import { unlessDenied } from "@/app/_lib/unless-denied";
import { academicWeb } from "@/modules/academic/web/services";
import { incidentsWeb } from "@/modules/incidents/web/services";
import { loansWeb } from "@/modules/loans/web/services";

// Each panel of the laboratory home reads through its module's authorized web
// adapter and appears only for people allowed to see it.
function optional<T>(enabled: boolean, read: () => Promise<T>) {
  return enabled ? unlessDenied(read, null) : null;
}

export async function laboratoryHome(
  slug: string,
  permissionKeys: readonly string[],
) {
  const can = (key: string) => permissionKeys.includes(key);
  const [academic, incidents, loans] = await Promise.all([
    optional(can("academic.read"), () => academicWeb.upcoming(slug)),
    optional(can("incident.review") || can("incident.read"), () =>
      incidentsWeb.page(slug, can("incident.review") ? "laboratory" : "own"),
    ),
    optional(can("inventory.loan") || can("inventory.loan.read"), () =>
      loansWeb.page(slug, "active"),
    ),
  ]);
  const pendingIncidents =
    incidents?.entries.filter((entry) => entry.status !== "resolved") ?? null;
  const activeLoans = loans
    ? (loans.laboratory ?? loans.own ?? []).filter(
        (loan) => loan.status === "active",
      )
    : null;
  return {
    academic,
    incidents: pendingIncidents,
    incidentsScope: can("incident.review") ? "laboratory" : "own",
    loans: activeLoans,
    loansScope: loans?.laboratory ? "laboratory" : "own",
  };
}
