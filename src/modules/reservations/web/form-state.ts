export type ReservationActionState = {
  status: "idle" | "available" | "unavailable" | "error" | "success";
  message: string;
  fingerprint?: string;
};
export const initialReservationActionState: ReservationActionState = {
  status: "idle",
  message: "",
};
export function reservationFormFingerprint(form: FormData) {
  return JSON.stringify([
    form.get("spaceId"),
    form.get("mode"),
    form.getAll("resourceIds").map(String).sort(),
    form.get("startsLocal"),
    form.get("endsLocal"),
  ]);
}
