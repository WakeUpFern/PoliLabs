import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import type { ListSpaces } from "@/modules/spatial/application/list-spaces";
import type { ListLocations } from "@/modules/spatial/application/list-locations";
import type {
  CreateInventoryItem,
  UpdateInventoryItem,
  DeactivateInventoryItem,
  RecordInventoryMovement,
  ListInventory,
  GetInventoryItem,
} from "../application/inventory";
import type { ActorContext } from "../application/inventory-store";
import { InventoryError, type InventoryItem } from "../domain/inventory";
export type InventoryActionState = {
  status: "idle" | "error" | "success";
  message: string;
};
export type LocationOption = { id: string; label: string };
type Services = {
  currentActor: () => Promise<{ actorUserId: string }>;
  laboratory: Pick<GetLaboratoryBySlug, "execute">;
  authorization: Pick<AuthorizationService, "authorize">;
  spaces: Pick<ListSpaces, "execute">;
  locations: Pick<ListLocations, "execute">;
  list: Pick<ListInventory, "execute">;
  get: Pick<GetInventoryItem, "execute">;
  create: Pick<CreateInventoryItem, "execute">;
  update: Pick<UpdateInventoryItem, "execute">;
  deactivate: Pick<DeactivateInventoryItem, "execute">;
  record: Pick<RecordInventoryMovement, "execute">;
};
export const UNIT_LABELS = {
  piece: "piezas",
  metre: "m",
  litre: "L",
  kilogram: "kg",
} as const;
export const TYPE_LABELS = {
  consumable: "Consumible",
  reusable_tool: "Herramienta reutilizable",
} as const;
export const MOVEMENT_LABELS = {
  initial: "Existencia inicial",
  purchase: "Compra",
  entry: "Entrada",
  consumption: "Consumo",
  damage: "Daño",
  loss: "Pérdida",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de salida",
} as const;
export function inventoryActionError(error: unknown): InventoryActionState {
  if (error instanceof AuthorizationDeniedError)
    return {
      status: "error",
      message:
        "Ya no tienes permiso para realizar esta operación en el laboratorio.",
    };
  if (error instanceof InventoryError) {
    const messages = {
      input:
        "Revisa los datos: nombre obligatorio, cantidad válida con hasta tres decimales y motivo obligatorio para movimientos. Las piezas deben ser enteras.",
      "not-found": "El artículo no está disponible en este laboratorio.",
      location:
        "La ubicación ya no está activa o pertenece a otro laboratorio. Selecciona otra ubicación o deja el artículo sin ubicación.",
      "insufficient-stock":
        "La cantidad supera la existencia actual. El saldo pudo cambiar; consulta el detalle y vuelve a intentarlo.",
      "has-stock":
        "El artículo tiene existencias. Registra los movimientos que correspondan antes de desactivarlo.",
      "immutable-unit":
        "El tipo y la unidad no se pueden cambiar después del primer movimiento. Crea otro artículo si corresponde.",
      inactive:
        "El artículo está desactivado y conserva únicamente su historial.",
      "tool-consumption":
        "Una herramienta reutilizable no admite consumo. Registra un préstamo y su devolución desde el detalle del artículo.",
      "loaned-stock":
        "La existencia no puede quedar por debajo de las unidades prestadas. Registra primero la devolución (con daño o pérdida si corresponde).",
    };
    return { status: "error", message: messages[error.code] };
  }
  throw error;
}
function value(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}
export class InventoryWeb {
  constructor(private readonly services: Services) {}
  private async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const laboratory = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    const actor = { actorUserId, laboratoryId: laboratory.id };
    return { actor, laboratory };
  }
  private async catalog(actor: ActorContext): Promise<LocationOption[]> {
    try {
      const { spaces } = await this.services.spaces.execute(actor);
      const groups = await Promise.all(
        spaces.map(async (space) => {
          const { locations } = await this.services.locations.execute({
            ...actor,
            spaceId: space.id,
          });
          const map = new Map(
            locations.map((location) => [location.id, location]),
          );
          return locations.map((location) => {
            const names: string[] = [];
            const visited = new Set<string>();
            let current: typeof location | undefined = location;
            while (current && !visited.has(current.id)) {
              visited.add(current.id);
              names.unshift(current.name);
              current = current.parentId
                ? map.get(current.parentId)
                : undefined;
            }
            return {
              id: location.id,
              label: [space.name, ...names].join(" > "),
            };
          });
        }),
      );
      return groups.flat();
    } catch (error) {
      if (!(error instanceof AuthorizationDeniedError)) throw error;
      return [];
    }
  }
  async list(
    slug: string,
    filter: { search?: string; type?: string; includeInactive?: boolean } = {},
  ) {
    const { actor, laboratory } = await this.context(slug);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "inventory.read",
    });
    const [items, locations] = await Promise.all([
      this.services.list.execute({ ...actor, ...filter }),
      this.catalog(actor),
    ]);
    return {
      laboratory,
      items,
      locations,
      canManage: grant.permissionKeys.includes("inventory.manage"),
    };
  }
  async detail(slug: string, itemId: string) {
    const { actor, laboratory } = await this.context(slug);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "inventory.read",
    });
    const [detail, locations] = await Promise.all([
      this.services.get.execute({ ...actor, itemId }),
      this.catalog(actor),
    ]);
    return {
      laboratory,
      item: detail.item,
      movements: detail.movements.map((movement) => ({
        ...movement,
        createdAt: movement.createdAt.toISOString(),
      })),
      locations,
      canManage: grant.permissionKeys.includes("inventory.manage"),
      canAdjust: grant.permissionKeys.includes("inventory.adjust"),
    };
  }
  async newForm(slug: string) {
    const { actor, laboratory } = await this.context(slug);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "inventory.manage",
    });
    return {
      laboratory,
      locations: await this.catalog(actor),
      canAdjust: grant.permissionKeys.includes("inventory.adjust"),
    };
  }
  private async validateLocation(actor: ActorContext, locationId: string) {
    if (
      locationId &&
      !(await this.catalog(actor)).some((option) => option.id === locationId)
    )
      throw new InventoryError("location");
  }
  async submit(
    slug: string,
    operation: "create" | "update" | "movement" | "deactivate",
    itemId: string | null,
    form: FormData,
  ): Promise<{ itemId: string; message: string }> {
    const { actor } = await this.context(slug);
    const common = { ...actor, source: "WEB" };
    if (operation === "create" || operation === "update") {
      const locationId = value(form, "locationId");
      await this.validateLocation(actor, locationId);
      const values = {
        ...common,
        name: value(form, "name"),
        type: value(form, "type"),
        unit: value(form, "unit"),
        locationId,
      };
      const item =
        operation === "create"
          ? await this.services.create.execute({
              ...values,
              initialQuantity: value(form, "initialQuantity") || "0",
              notes: value(form, "notes"),
            })
          : await this.services.update.execute({
              ...values,
              itemId: itemId ?? "",
            });
      return {
        itemId: item.id,
        message:
          operation === "create"
            ? "Artículo registrado."
            : "Artículo actualizado.",
      };
    }
    if (operation === "movement") {
      await this.services.record.execute({
        ...common,
        itemId: itemId ?? "",
        type: value(form, "type"),
        quantity: value(form, "quantity"),
        notes: value(form, "notes"),
      });
      return {
        itemId: itemId ?? "",
        message:
          "Movimiento registrado. El saldo y el historial se actualizaron.",
      };
    }
    if (operation !== "deactivate") throw new InventoryError("input");
    await this.services.deactivate.execute({ ...common, itemId: itemId ?? "" });
    return {
      itemId: itemId ?? "",
      message: "Artículo desactivado. Su historial se conserva.",
    };
  }
}
export function locationLabel(
  item: Pick<InventoryItem, "locationId">,
  locations: LocationOption[],
) {
  return item.locationId
    ? (locations.find((option) => option.id === item.locationId)?.label ??
        "Ubicación fuera del catálogo visible")
    : "Sin ubicación";
}
