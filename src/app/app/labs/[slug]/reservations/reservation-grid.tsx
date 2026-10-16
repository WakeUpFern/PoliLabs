"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  initialReservationActionState,
  type ReservationActionState,
} from "@/modules/reservations/web/form-state";
import {
  addLocalMinutes,
  DURATIONS,
  formatDuration,
  layoutDay,
  minuteToTime,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
} from "@/modules/reservations/web/grid";
import type {
  OccupancyView,
  ReservationSpaceOption,
} from "@/modules/reservations/web/reservation-web";
import { localToInstant } from "@/modules/reservations/web/time";

export type GridDay = {
  date: string;
  start: string;
  end: string;
  label: string;
  shortLabel: string;
  isToday: boolean;
};

type Draft = {
  date: string;
  time: string;
  duration: number;
  mode: "space" | "resources";
  resourceIds: string[];
};

const SLOT_PX = 28;
const inputStyle =
  "min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 focus:outline-none focus:ring-4 focus:ring-[#7a1731]/20";

function overlapping(entries: readonly OccupancyView[], draft: Draft) {
  try {
    const start = Date.parse(localToInstant(`${draft.date}T${draft.time}`));
    const end = Date.parse(
      localToInstant(addLocalMinutes(draft.date, draft.time, draft.duration)),
    );
    return {
      valid: true,
      past: start <= Date.now(),
      entries: entries.filter(
        (e) => Date.parse(e.startsAt) < end && Date.parse(e.endsAt) > start,
      ),
    };
  } catch {
    return { valid: false, past: false, entries: [] };
  }
}

export function ReservationGrid({
  days,
  entries,
  spaceEntries,
  space,
  resourceId,
  canCreate,
  now,
  autoDayHref,
  slug,
  action,
}: {
  days: GridDay[];
  entries: OccupancyView[];
  spaceEntries: OccupancyView[];
  space: ReservationSpaceOption;
  resourceId: string | null;
  canCreate: boolean;
  now: number;
  autoDayHref: string | null;
  slug: string;
  action: (
    state: ReservationActionState,
    form: FormData,
  ) => Promise<ReservationActionState>;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    date: string;
    from: number;
    to: number;
  } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState("");
  // The panel closes from the action itself once the booking is created.
  const [state, formAction, pending] = useActionState(
    async (previous: ReservationActionState, form: FormData) => {
      const result = await action(previous, form);
      if (result.status === "success") {
        setDraft(null);
        setNotice(result.message);
      }
      return result;
    },
    initialReservationActionState,
  );

  // Phones open on the day view unless a view was chosen explicitly.
  useEffect(() => {
    if (autoDayHref && window.matchMedia("(max-width: 639px)").matches)
      router.replace(autoDayHref);
  }, [autoDayHref, router]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * 2 * SLOT_PX - 12 });
  }, []);
  useEffect(() => {
    if (!draft) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [draft]);

  const open = (date: string, slot: number, slots: number) => {
    if (!canCreate) return;
    const preselected =
      resourceId &&
      space.resources.some((r) => r.id === resourceId && r.available);
    setNotice("");
    setDraft({
      date,
      time: minuteToTime(slot * SLOT_MINUTES),
      duration: Math.min(slots * SLOT_MINUTES, 480),
      mode: preselected ? "resources" : "space",
      resourceIds: preselected ? [resourceId] : [],
    });
  };
  const slotAt = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((event.clientY - rect.top) / SLOT_PX),
      ),
    );
  };
  const isPast = (day: GridDay, slot: number) =>
    Date.parse(day.start) + (slot + 1) * SLOT_MINUTES * 60_000 <= now;

  const check = useMemo(
    () => (draft ? overlapping(spaceEntries, draft) : null),
    [draft, spaceEntries],
  );
  const busyResource = (id: string) =>
    check?.entries.some((e) => e.isExclusive || e.resourceIds.includes(id)) ??
    false;
  const spaceBusy = Boolean(check?.entries.length);
  const endsLocal = draft
    ? addLocalMinutes(draft.date, draft.time, draft.duration)
    : "";
  const ready =
    draft &&
    check?.valid &&
    !check.past &&
    (draft.mode === "space"
      ? !spaceBusy
      : draft.resourceIds.length > 0 &&
        draft.resourceIds.every((id) => !busyResource(id)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          {canCreate
            ? "Toca una franja libre o arrastra sobre ella para reservar."
            : "Necesitas permiso de creación para reservar desde el calendario."}
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              const day = days.find((d) => d.isToday) ?? days[0];
              const slot = day.isToday
                ? Math.ceil((now - Date.parse(day.start)) / 1_800_000)
                : 18;
              open(day.date, Math.min(slot, SLOTS_PER_DAY - 2), 2);
            }}
            className="rounded-xl bg-[#7a1731] px-4 py-2 text-sm font-semibold text-white"
          >
            Nueva reservación
          </button>
        )}
      </div>
      <p
        aria-live="polite"
        className="mb-2 text-sm font-semibold text-emerald-700"
      >
        {notice}
      </p>

      <div
        ref={scroller}
        className="max-h-[70vh] overflow-auto rounded-2xl border border-stone-200 bg-white"
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `3rem repeat(${days.length}, minmax(${days.length > 1 ? "6.5rem" : "0"}, 1fr))`,
          }}
        >
          <div className="sticky top-0 z-20 border-b border-stone-200 bg-white" />
          {days.map((day) => (
            <div
              key={day.date}
              className={`sticky top-0 z-20 border-b border-l border-stone-200 bg-white px-2 py-2 text-center text-sm font-semibold capitalize ${
                day.isToday ? "text-[#7a1731]" : ""
              }`}
            >
              {days.length > 1 ? day.shortLabel : day.label}
            </div>
          ))}
          <div className="relative" style={{ height: SLOTS_PER_DAY * SLOT_PX }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[11px] text-stone-500"
                style={{ top: hour * 2 * SLOT_PX }}
              >
                {hour ? `${String(hour).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const blocks = layoutDay(entries, day.start, day.end);
            const nowMinute = (now - Date.parse(day.start)) / 60_000;
            const selecting = drag?.date === day.date ? drag : null;
            return (
              <div
                key={day.date}
                role="group"
                aria-label={day.label}
                className="relative touch-pan-y select-none border-l border-stone-200"
                style={{
                  height: SLOTS_PER_DAY * SLOT_PX,
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #f0ece8 27px, #f0ece8 28px)",
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse" || event.button !== 0)
                    return;
                  const slot = slotAt(event);
                  if (isPast(day, slot) || !canCreate) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDrag({ date: day.date, from: slot, to: slot });
                }}
                onPointerMove={(event) => {
                  if (!selecting) return;
                  setDrag({
                    ...selecting,
                    to: Math.max(selecting.from, slotAt(event)),
                  });
                }}
                onPointerUp={(event) => {
                  if (event.pointerType === "mouse") {
                    if (selecting)
                      open(
                        day.date,
                        selecting.from,
                        selecting.to - selecting.from + 1,
                      );
                    setDrag(null);
                    return;
                  }
                  const slot = slotAt(event);
                  if (!isPast(day, slot)) open(day.date, slot, 2);
                }}
              >
                {nowMinute > 0 && nowMinute < 1440 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: (nowMinute / SLOT_MINUTES) * SLOT_PX }}
                  />
                )}
                {nowMinute > 0 && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 bg-stone-100/70"
                    style={{
                      height:
                        (Math.min(nowMinute, 1440) / SLOT_MINUTES) * SLOT_PX,
                    }}
                  />
                )}
                {selecting && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1 z-10 rounded-lg border-2 border-dashed border-[#7a1731] bg-[#7a1731]/10"
                    style={{
                      top: selecting.from * SLOT_PX,
                      height: (selecting.to - selecting.from + 1) * SLOT_PX,
                    }}
                  />
                )}
                {draft?.date === day.date && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1 z-10 rounded-lg border-2 border-[#7a1731] bg-[#7a1731]/15"
                    style={{
                      top:
                        ((Number(draft.time.slice(0, 2)) * 60 +
                          Number(draft.time.slice(3))) /
                          SLOT_MINUTES) *
                        SLOT_PX,
                      height: (draft.duration / SLOT_MINUTES) * SLOT_PX,
                    }}
                  />
                )}
                {blocks.map((block, index) => {
                  const time = `${minuteToTime(Math.round(block.startMinute))}–${minuteToTime(Math.round(block.endMinute))}`;
                  const label = `${block.entry.isMine ? "Mi reservación" : "Ocupado"} · ${block.entry.target}`;
                  const style = {
                    top: (block.startMinute / SLOT_MINUTES) * SLOT_PX + 1,
                    height: Math.max(
                      SLOT_PX - 2,
                      ((block.endMinute - block.startMinute) / SLOT_MINUTES) *
                        SLOT_PX -
                        2,
                    ),
                    left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / block.lanes}% - 4px)`,
                  };
                  const className = `absolute z-10 overflow-hidden rounded-lg border-l-4 px-1.5 py-0.5 text-xs leading-tight ${
                    block.entry.isMine
                      ? "border-[#7a1731] bg-[#f3e3e7] text-[#641229]"
                      : "border-stone-400 bg-stone-200 text-stone-700"
                  }`;
                  const body = (
                    <>
                      <span className="block font-semibold">{time}</span>
                      <span className="block">{label}</span>
                    </>
                  );
                  return block.entry.reservationId ? (
                    <Link
                      key={index}
                      href={`/app/labs/${slug}/reservations/${block.entry.reservationId}`}
                      className={className}
                      style={style}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      key={index}
                      className={className}
                      style={style}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {draft && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="grid-booking-title"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-stone-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[26rem] sm:rounded-3xl"
        >
          <form action={formAction} onReset={(e) => e.preventDefault()}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="grid-booking-title" className="text-lg font-semibold">
                Reservar en {space.name}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg px-2 text-sm font-semibold text-stone-600"
              >
                Cerrar
              </button>
            </div>
            <input type="hidden" name="spaceId" value={space.id} />
            <input type="hidden" name="mode" value={draft.mode} />
            <input
              type="hidden"
              name="startsLocal"
              value={`${draft.date}T${draft.time}`}
            />
            <input type="hidden" name="endsLocal" value={endsLocal} />
            <fieldset disabled={pending} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label
                    htmlFor="grid-date"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Fecha
                  </label>
                  <input
                    id="grid-date"
                    type="date"
                    required
                    value={draft.date}
                    onChange={(e) =>
                      e.target.value &&
                      setDraft({ ...draft, date: e.target.value })
                    }
                    className={inputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="grid-time"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Inicio
                  </label>
                  <input
                    id="grid-time"
                    type="time"
                    required
                    step={60}
                    value={draft.time}
                    onChange={(e) =>
                      e.target.value &&
                      setDraft({ ...draft, time: e.target.value })
                    }
                    className={inputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="grid-duration"
                    className="mb-1 block text-sm font-semibold"
                  >
                    Duración
                  </label>
                  <select
                    id="grid-duration"
                    value={draft.duration}
                    onChange={(e) =>
                      setDraft({ ...draft, duration: Number(e.target.value) })
                    }
                    className={inputStyle}
                  >
                    {[...new Set([...DURATIONS, draft.duration])]
                      .sort((a, b) => a - b)
                      .map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {formatDuration(minutes)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <p className="text-sm text-stone-600">
                Termina a las {endsLocal.slice(11)}
                {endsLocal.slice(0, 10) !== draft.date
                  ? " del día siguiente"
                  : ""}
                . Hora de Ciudad de México.
              </p>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Qué reservas</legend>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={draft.mode === "space"}
                    onChange={() =>
                      setDraft({ ...draft, mode: "space", resourceIds: [] })
                    }
                  />
                  Espacio completo
                  {spaceBusy && (
                    <span className="text-xs text-[#7a1731]">
                      (hay reservaciones)
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    disabled={
                      !space.canReadResources || !space.resources.length
                    }
                    checked={draft.mode === "resources"}
                    onChange={() => setDraft({ ...draft, mode: "resources" })}
                  />
                  Uno o varios recursos
                </label>
                {draft.mode === "resources" && (
                  <div className="space-y-2 rounded-xl bg-stone-50 p-3">
                    {space.resources.map((resource) => {
                      const busy = busyResource(resource.id);
                      return (
                        <label
                          key={resource.id}
                          className="flex items-center gap-3"
                        >
                          <input
                            type="checkbox"
                            name="resourceIds"
                            value={resource.id}
                            disabled={!resource.available || busy}
                            checked={draft.resourceIds.includes(resource.id)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                resourceIds: e.target.checked
                                  ? [...draft.resourceIds, resource.id]
                                  : draft.resourceIds.filter(
                                      (id) => id !== resource.id,
                                    ),
                              })
                            }
                          />
                          <span>
                            {resource.name}
                            {!resource.available ? (
                              <span className="block text-xs text-[#7a1731]">
                                En mantenimiento o fuera de servicio
                              </span>
                            ) : busy ? (
                              <span className="block text-xs text-[#7a1731]">
                                Ocupado en ese horario
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
              {check && !check.valid && (
                <p className="text-sm text-red-700">
                  Revisa la fecha y la hora.
                </p>
              )}
              {check?.past && (
                <p className="text-sm text-red-700">
                  El inicio debe estar en el futuro.
                </p>
              )}
              {state.status === "error" && (
                <p role="alert" className="text-sm text-red-700">
                  {state.message}
                </p>
              )}
              <button
                type="submit"
                disabled={!ready || pending}
                className="min-h-12 w-full rounded-xl bg-[#7a1731] px-5 font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Reservando…" : "Reservar"}
              </button>
            </fieldset>
          </form>
        </div>
      )}
    </div>
  );
}
