"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Bell, Menu, Plus, X } from "lucide-react";
import { LogoutButton } from "@/app/_components/logout-button";
import { NavIcon } from "./nav-icon";
import type { NavItem } from "./navigation";

type ShellProps = {
  /** The laboratory being worked in; absent on account pages. */
  laboratory: {
    name: string;
    href: string;
    sections: NavItem[];
    create: NavItem[];
  } | null;
  laboratories: readonly { slug: string; name: string }[];
  account: NavItem[];
  user: { name: string; email: string };
  unread: number;
  children: React.ReactNode;
};

function pathOf(href: string) {
  return href.split("?")[0];
}

function activeItem(pathname: string, items: NavItem[]) {
  let best: NavItem | null = null;
  for (const item of items) {
    const path = pathOf(item.href);
    const matches =
      pathname === path || (!item.exact && pathname.startsWith(`${path}/`));
    if (matches && (!best || path.length > pathOf(best.href).length))
      best = item;
  }
  return best;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Logo({ onGuinda = false }: { onGuinda?: boolean }) {
  return (
    <span
      className={`grid size-8 flex-none place-items-center rounded-md text-sm font-bold ${onGuinda ? "bg-white text-guinda" : "bg-guinda text-white"}`}
    >
      L
    </span>
  );
}

export function AppShell({
  laboratory,
  laboratories,
  account,
  user,
  unread,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const createMenu = useRef<HTMLDetailsElement>(null);

  const sections = laboratory?.sections ?? [];
  const current = activeItem(pathname, [...sections, ...account]);

  // Following a link closes whatever menu it came from.
  useEffect(() => {
    drawer.current?.close();
    createMenu.current?.removeAttribute("open");
  }, [pathname]);

  const close = () => drawer.current?.close();

  const row = (item: NavItem) => (
    <Link
      key={item.key}
      href={item.href}
      aria-current={current?.key === item.key ? "page" : undefined}
      className="nav-row"
    >
      <NavIcon name={item.icon} className="nav-icon" />
      <span className="text-[0.9375rem]">{item.label}</span>
    </Link>
  );

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="topbar flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            ref={opener}
            type="button"
            onClick={() => drawer.current?.showModal()}
            aria-label="Abrir menú"
            aria-haspopup="dialog"
            aria-controls="app-menu"
            className="icon-btn"
          >
            <Menu aria-hidden className="size-4.5" />
          </button>
          <Link
            href={laboratory ? laboratory.href : "/app"}
            aria-label="Labora, inicio"
          >
            <Logo onGuinda />
          </Link>
          <p className="min-w-0 flex-1 truncate font-bold text-white">
            {laboratory ? (
              <Link href={laboratory.href} className="hover:underline">
                {laboratory.name}
              </Link>
            ) : (
              "Labora"
            )}
          </p>

          {laboratory && laboratory.create.length > 0 ? (
            <details ref={createMenu} className="relative">
              <summary
                aria-label="Crear"
                className="icon-btn cursor-pointer list-none [&::-webkit-details-marker]:hidden"
              >
                <Plus aria-hidden className="size-4.5" />
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-line bg-surface p-1.5 shadow-lg">
                {laboratory.create.map((action) => (
                  <Link key={action.key} href={action.href} className="nav-row">
                    <NavIcon name={action.icon} className="nav-icon" />
                    <span className="text-sm">{action.label}</span>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          <Link
            href="/app/notifications"
            className="icon-btn relative"
            aria-label={
              unread > 0
                ? `Notificaciones ${unread > 99 ? "99+" : unread} sin leer`
                : "Notificaciones"
            }
          >
            <Bell aria-hidden className="size-4.5" />
            {unread > 0 ? (
              <span
                aria-hidden
                className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-guinda bg-oro-light"
              />
            ) : null}
          </Link>
          <span
            title={`${user.name}\n${user.email}`}
            className="grid size-8 flex-none place-items-center rounded-full bg-white/15 text-xs font-bold text-white ring-1 ring-white/30"
          >
            {initials(user.name)}
          </span>
        </div>

        {sections.length > 0 ? (
          <nav
            aria-label="Secciones del laboratorio"
            className="overflow-x-auto px-2 [scrollbar-width:none] sm:px-4"
          >
            <ul className="flex w-max gap-0.5">
              {sections.map((item) => {
                const active = current?.key === item.key;
                return (
                  <li key={item.key} className="relative pb-2">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-9 items-center gap-1.5 rounded-md px-2 text-[0.875rem] whitespace-nowrap transition hover:bg-ink/6 ${active ? "font-bold" : ""}`}
                    >
                      <NavIcon
                        name={item.icon}
                        className={`size-4 ${active ? "text-ink" : "text-muted"}`}
                      />
                      {item.label}
                      {item.counter ? (
                        <span className="counter">{item.counter}</span>
                      ) : null}
                    </Link>
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-guinda"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </header>

      <main className="px-4 py-6 sm:px-6 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <dialog
        ref={drawer}
        id="app-menu"
        aria-label="Menú"
        className="drawer"
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) close();
        }}
        onClose={() => opener.current?.focus()}
      >
        <div className="flex h-full flex-col overflow-y-auto px-3 pb-4">
          <div className="flex items-center justify-between px-1 py-4">
            <Logo />
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar menú"
              className="grid size-9 place-items-center rounded-md text-muted hover:bg-ink/6 hover:text-ink"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          {sections.length > 0 ? (
            <>
              <nav aria-label="Laboratorio" className="flex flex-col gap-0.5">
                {sections.map(row)}
              </nav>
              <hr className="my-3 border-line" />
            </>
          ) : null}
          <nav aria-label="Cuenta" className="flex flex-col gap-0.5">
            {account.map(row)}
          </nav>

          {laboratories.length > 1 ? (
            <>
              <hr className="my-3 border-line" />
              <p className="px-2.5 pb-1.5 text-sm font-semibold text-muted">
                Tus laboratorios
              </p>
              <div className="flex flex-col gap-0.5">
                {laboratories.map((lab) => (
                  <Link
                    key={lab.slug}
                    href={`/app/labs/${encodeURIComponent(lab.slug)}`}
                    className="nav-row"
                  >
                    <span className="grid size-5 flex-none place-items-center rounded bg-guinda-tint text-[0.6875rem] font-bold text-guinda">
                      {lab.name.slice(0, 1)}
                    </span>
                    <span className="truncate text-[0.9375rem]">
                      {lab.name}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <hr className="my-3 border-line" />
          <div className="px-2.5 pb-2 text-sm">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-muted">{user.email}</p>
          </div>
          <LogoutButton variant="menu" />
        </div>
      </dialog>
    </div>
  );
}
