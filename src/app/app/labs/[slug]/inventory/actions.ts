"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inventoryWeb } from "@/modules/inventory/web/services";
import {
  inventoryActionError,
  type InventoryActionState,
} from "@/modules/inventory/web/inventory-web";
export async function inventoryAction(
  slug: string,
  operation: "create" | "update" | "movement" | "deactivate",
  itemId: string | null,
  _state: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  let result;
  try {
    result = await inventoryWeb.submit(slug, operation, itemId, form);
  } catch (error) {
    return inventoryActionError(error);
  }
  revalidatePath(`/app/labs/${slug}/inventory`);
  revalidatePath(`/app/labs/${slug}/inventory/${result.itemId}`);
  if (operation === "create")
    redirect(`/app/labs/${slug}/inventory/${result.itemId}?created=1`);
  return { status: "success", message: result.message };
}
