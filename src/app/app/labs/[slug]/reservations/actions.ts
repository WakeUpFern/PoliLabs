"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reservationWeb } from "@/modules/reservations/web/services";
import { reservationActionError } from "@/modules/reservations/web/reservation-web";
import {
  reservationFormFingerprint,
  type ReservationActionState,
} from "@/modules/reservations/web/form-state";

export async function reservationFormAction(
  slug: string,
  _state: ReservationActionState,
  form: FormData,
): Promise<ReservationActionState> {
  let result;
  try {
    result = await reservationWeb.submit(slug, form);
  } catch (error) {
    return {
      ...reservationActionError(error),
      fingerprint: reservationFormFingerprint(form),
    };
  }
  if (result.reservationId) {
    revalidatePath(`/app/labs/${slug}/reservations`);
    redirect(
      `/app/labs/${slug}/reservations/${result.reservationId}?created=1`,
    );
  }
  return result.state;
}
export async function cancelReservationAction(
  slug: string,
  reservationId: string,
  _state: ReservationActionState,
  _form: FormData,
): Promise<ReservationActionState> {
  void _form;
  let result;
  try {
    result = await reservationWeb.cancel(slug, reservationId);
  } catch (error) {
    return reservationActionError(error);
  }
  revalidatePath(`/app/labs/${slug}/reservations`);
  revalidatePath(`/app/labs/${slug}/reservations/${reservationId}`);
  return result;
}
