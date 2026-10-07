import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { loanService } from "../infrastructure/services";
import { LoansWeb } from "./loans-web";
export const loansWeb = new LoansWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  loans: loanService,
});
