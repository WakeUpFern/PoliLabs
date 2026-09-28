export type OrganizationActionState = {
  message: string | null;
  status: "idle" | "error" | "success";
};

export const initialOrganizationActionState: OrganizationActionState = {
  message: null,
  status: "idle",
};
