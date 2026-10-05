import type { GetLaboratoryBySlug } from "@/modules/identity/application/get-laboratory-by-slug";
import type { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { AuthorizationDeniedError } from "@/modules/identity/domain/access-errors";
import type { ListSpaces } from "@/modules/spatial/application/list-spaces";
import type { ListResources } from "@/modules/spatial/application/list-resources";
import type { ListLocations } from "@/modules/spatial/application/list-locations";
import type {
  CheckAvailability,
  CreateReservation,
  GetReservation,
  ListMyReservations,
  CancelReservation,
} from "../application/reservations";
import {
  ReservationInputError,
  ReservationTargetError,
  ReservationConflictError,
  ReservationNotFoundError,
  ReservationCancellationError,
  type Reservation,
} from "../domain/reservation";
import { localToInstant } from "./time";
import {
  reservationFormFingerprint,
  type ReservationActionState,
} from "./form-state";

type Services = {
  currentActor: () => Promise<{ actorUserId: string }>;
  laboratory: Pick<GetLaboratoryBySlug, "execute">;
  authorization: Pick<AuthorizationService, "authorize">;
  spaces: Pick<ListSpaces, "execute">;
  resources: Pick<ListResources, "execute">;
  locations: Pick<ListLocations, "execute">;
  availability: Pick<CheckAvailability, "execute">;
  create: Pick<CreateReservation, "execute">;
  list: Pick<ListMyReservations, "execute">;
  get: Pick<GetReservation, "execute">;
  cancel: Pick<CancelReservation, "execute">;
};
export type ReservationSpaceOption = {
  id: string;
  name: string;
  resources: { id: string; name: string; location: string | null }[];
  canReadResources: boolean;
};
export type ReservationView = Omit<
  Reservation,
  "startsAt" | "endsAt" | "createdAt" | "cancelledAt" | "createdBy"
> & {
  startsAt: string;
  endsAt: string;
  createdAt: string;
  cancelledAt: string | null;
  spaceName: string;
  resources: { id: string; name: string; location: string | null }[];
};
export function reservationActionError(error: unknown): ReservationActionState {
  if (error instanceof ReservationConflictError)
    return {
      status: "error",
      message:
        "El intervalo ya no está disponible. Otra reservación pudo confirmarse mientras consultabas; elige otro horario y vuelve a comprobar.",
    };
  if (error instanceof ReservationInputError)
    return {
      status: "error",
      message:
        "Revisa la modalidad, los recursos y las fechas. El fin debe ser posterior al inicio y, al crear, el inicio debe estar en el futuro. Usa una hora válida y sin ambigüedad en America/Mexico_City.",
    };
  if (error instanceof ReservationTargetError)
    return {
      status: "error",
      message:
        "El espacio o los recursos seleccionados ya no están disponibles en este catálogo. Selecciona recursos activos del mismo espacio.",
    };
  if (error instanceof ReservationCancellationError)
    return {
      status: "error",
      message: "No se puede cancelar una reservación que ya inició o pasó.",
    };
  if (
    error instanceof ReservationNotFoundError ||
    error instanceof AuthorizationDeniedError
  )
    return {
      status: "error",
      message:
        "La reservación o el laboratorio no están disponibles, o ya no tienes permiso para realizar esta operación.",
    };
  throw error;
}

// Web adapter: authenticates/resolves navigation and translates forms; domain
// decisions remain in the existing application services and transactions.
export class ReservationWeb {
  constructor(private readonly services: Services) {}
  private async context(slug: string) {
    const { actorUserId } = await this.services.currentActor();
    const laboratory = await this.services.laboratory.execute({
      actorUserId,
      laboratorySlug: slug,
    });
    return { laboratory, actor: { actorUserId, laboratoryId: laboratory.id } };
  }
  private async catalog(actor: {
    actorUserId: string;
    laboratoryId: string;
  }): Promise<ReservationSpaceOption[]> {
    const { spaces } = await this.services.spaces.execute(actor);
    return Promise.all(
      spaces.map(async (space) => {
        const input = { ...actor, spaceId: space.id };
        let resources: Awaited<
          ReturnType<ListResources["execute"]>
        >["resources"] = [];
        let canReadResources = true;
        try {
          resources = (await this.services.resources.execute(input)).resources;
        } catch (error) {
          if (!(error instanceof AuthorizationDeniedError)) throw error;
          canReadResources = false;
        }
        let locations: Awaited<
          ReturnType<ListLocations["execute"]>
        >["locations"] = [];
        if (resources.length) {
          try {
            locations = (await this.services.locations.execute(input))
              .locations;
          } catch (error) {
            if (!(error instanceof AuthorizationDeniedError)) throw error;
          }
        }
        return {
          id: space.id,
          name: space.name,
          canReadResources,
          resources: resources.map((resource) => ({
            id: resource.id,
            name: resource.name,
            location:
              locations.find((location) => location.id === resource.locationId)
                ?.name ?? null,
          })),
        };
      }),
    );
  }
  private async displayCatalog(actor: {
    actorUserId: string;
    laboratoryId: string;
  }) {
    try {
      return await this.catalog(actor);
    } catch (error) {
      if (!(error instanceof AuthorizationDeniedError)) throw error;
      return [];
    }
  }
  private view(
    reservation: Reservation,
    catalog: ReservationSpaceOption[],
  ): ReservationView {
    const space = catalog.find((space) => space.id === reservation.spaceId);
    const { createdBy: _createdBy, ...record } = reservation;
    void _createdBy;
    return {
      ...record,
      startsAt: reservation.startsAt.toISOString(),
      endsAt: reservation.endsAt.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
      cancelledAt: reservation.cancelledAt?.toISOString() ?? null,
      spaceName:
        space?.name ??
        `Espacio fuera del catálogo visible (${reservation.spaceId})`,
      resources: reservation.resourceIds.map(
        (id) =>
          space?.resources.find((resource) => resource.id === id) ?? {
            id,
            name: `Recurso fuera del catálogo visible (${id})`,
            location: null,
          },
      ),
    };
  }
  async list(slug: string) {
    const { actor, laboratory } = await this.context(slug);
    const reservations = await this.services.list.execute(actor);
    const catalog = await this.displayCatalog(actor);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "reservation.read",
    });
    return {
      laboratory,
      now: Date.now(),
      canCreate: grant.permissionKeys.includes("reservation.create"),
      reservations: reservations.map((reservation) =>
        this.view(reservation, catalog),
      ),
    };
  }
  async detail(slug: string, reservationId: string) {
    const { actor, laboratory } = await this.context(slug);
    const reservation = await this.services.get.execute({
      ...actor,
      reservationId,
    });
    const catalog = await this.displayCatalog(actor);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "reservation.read",
    });
    return {
      laboratory,
      now: Date.now(),
      canCancel: grant.permissionKeys.includes("reservation.cancel"),
      reservation: this.view(reservation, catalog),
    };
  }
  async newForm(slug: string) {
    const { actor, laboratory } = await this.context(slug);
    const grant = await this.services.authorization.authorize({
      ...actor,
      requiredPermission: "reservation.read",
    });
    return {
      laboratory,
      now: Date.now(),
      canCreate: grant.permissionKeys.includes("reservation.create"),
      spaces: await this.catalog(actor),
    };
  }
  async submit(slug: string, form: FormData) {
    const { actor } = await this.context(slug);
    const intent = form.get("intent");
    if (intent !== "check" && intent !== "create")
      throw new ReservationInputError();
    const mode = form.get("mode");
    if (mode !== "space" && mode !== "resources")
      throw new ReservationInputError();
    const spaceId = String(form.get("spaceId") ?? "");
    const resourceIds = form.getAll("resourceIds").map(String);
    // Enforce Spatial visibility at the adapter boundary, using authorized services.
    // The Reservations service independently rechecks the authoritative target.
    const catalog = await this.catalog(actor);
    const space = catalog.find((space) => space.id === spaceId);
    if (!space) throw new ReservationTargetError();
    if (mode === "resources" && !space.canReadResources)
      throw new AuthorizationDeniedError();
    if (
      resourceIds.some(
        (id) => !space.resources.some((resource) => resource.id === id),
      )
    )
      throw new ReservationTargetError();
    const input = {
      ...actor,
      spaceId,
      resourceIds,
      isExclusive: mode === "space",
      startsAt: localToInstant(String(form.get("startsLocal") ?? "")),
      endsAt: localToInstant(String(form.get("endsLocal") ?? "")),
    };
    const fingerprint = reservationFormFingerprint(form);
    if (intent === "check") {
      const { available } = await this.services.availability.execute(input);
      return {
        state: {
          status: available ? "available" : "unavailable",
          message: available
            ? "Disponible. La disponibilidad se volverá a validar al confirmar."
            : "No disponible para el intervalo seleccionado.",
          fingerprint,
        } satisfies ReservationActionState,
      };
    }
    const reservation = await this.services.create.execute(input);
    return {
      reservationId: reservation.id,
      state: {
        status: "success",
        message: "Reservación creada.",
        fingerprint,
      } satisfies ReservationActionState,
    };
  }
  async cancel(
    slug: string,
    reservationId: string,
  ): Promise<ReservationActionState> {
    const { actor } = await this.context(slug);
    await this.services.cancel.execute({ ...actor, reservationId });
    return {
      status: "success",
      message: "Reservación cancelada. El historial se conserva.",
    };
  }
}
