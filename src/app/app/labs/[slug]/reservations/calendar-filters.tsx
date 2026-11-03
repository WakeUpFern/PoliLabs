"use client";

/**
 * Space and resource pickers that apply as soon as they change. The submit
 * button stays for keyboards and for a page whose scripts never load.
 */
export function CalendarFilters({ children }: { children: React.ReactNode }) {
  return (
    <form
      method="get"
      onChange={(event) => event.currentTarget.requestSubmit()}
      className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl"
    >
      {children}
      <button type="submit" className="sr-only">
        Mostrar
      </button>
    </form>
  );
}
