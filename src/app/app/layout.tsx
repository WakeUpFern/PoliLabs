import Link from "next/link";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { LogoutButton } from "@/app/_components/logout-button";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireCurrentActor();

  return (
    <div className="min-h-screen bg-[#f6f3ee] text-stone-950">
      <header className="border-b border-stone-200/90 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/app" className="group flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#7a1731] text-sm font-bold text-white shadow-sm">
              L
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[0.16em] text-[#7a1731]">
                LABORA
              </span>
              <span className="block text-xs text-stone-500">
                Gestión de laboratorios
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-stone-800">
                {actor.user.name}
              </p>
              <p className="text-xs text-stone-500">{actor.user.email}</p>
            </div>
            <LogoutButton compact />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-10">
        <nav
          aria-label="Navegación principal"
          className="lg:sticky lg:top-8 lg:self-start"
        >
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            <Link
              href="/app"
              className="whitespace-nowrap rounded-xl bg-white px-4 py-3 text-sm font-semibold text-stone-800 shadow-sm ring-1 ring-stone-200 transition hover:ring-stone-300"
            >
              Mis laboratorios
            </Link>
            <Link
              href="/app/account/security"
              className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-white hover:text-stone-950"
            >
              Seguridad
            </Link>
          </div>
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
