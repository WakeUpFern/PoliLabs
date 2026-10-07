"use server";
import { revalidatePath } from "next/cache";
import { loansWeb } from "@/modules/loans/web/services";
import {
  loanActionError,
  type LoanActionState,
} from "@/modules/loans/web/loans-web";
function refresh(slug: string, itemId: string) {
  revalidatePath(`/app/labs/${slug}/loans`);
  revalidatePath(`/app/labs/${slug}/inventory`);
  revalidatePath(`/app/labs/${slug}/inventory/${itemId}`);
}
export async function lendAction(
  slug: string,
  itemId: string,
  _previous: LoanActionState,
  form: FormData,
): Promise<LoanActionState> {
  try {
    await loansWeb.lend(slug, itemId, form);
  } catch (error) {
    return loanActionError(error);
  }
  refresh(slug, itemId);
  return { status: "success", message: "Préstamo registrado." };
}
export async function returnAction(
  slug: string,
  itemId: string,
  _previous: LoanActionState,
  form: FormData,
): Promise<LoanActionState> {
  let loan;
  try {
    loan = await loansWeb.registerReturn(slug, form);
  } catch (error) {
    return loanActionError(error);
  }
  refresh(slug, itemId);
  return {
    status: "success",
    message:
      loan.status === "returned"
        ? "Devolución registrada. El préstamo quedó cerrado."
        : `Devolución registrada. Quedan ${Number(loan.outstanding)} pendientes.`,
  };
}
