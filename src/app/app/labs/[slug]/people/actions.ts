"use server";
import { revalidatePath } from "next/cache";
import { membersWeb } from "@/modules/identity/web/services";
import type { MemberActionState } from "@/modules/identity/web/members-web";

function settle(slug: string, state: MemberActionState) {
  if (state.status === "success") revalidatePath(`/app/labs/${slug}/people`);
  return state;
}

export async function createMemberAction(
  slug: string,
  _previous: MemberActionState,
  form: FormData,
) {
  return settle(slug, await membersWeb.create(slug, form));
}

export async function changeRoleAction(
  slug: string,
  _previous: MemberActionState,
  form: FormData,
) {
  return settle(slug, await membersWeb.changeRole(slug, form));
}

export async function setActiveAction(
  slug: string,
  _previous: MemberActionState,
  form: FormData,
) {
  return settle(slug, await membersWeb.setActive(slug, form));
}

export async function resetPasswordAction(
  slug: string,
  _previous: MemberActionState,
  form: FormData,
) {
  return settle(slug, await membersWeb.resetPassword(slug, form));
}
