"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Bell, ChevronRight, Menu, X } from "lucide-react";
import { LogoutButton } from "@/app/_components/logout-button";
import { NavIcon } from "./nav-icon";
import type { NavGroup, NavItem } from "./navigation";

type ShellProps = {
  /** The laboratory being worked in; absent on account pages. */
  context: { title: string; home: NavItem } | null;
  groups: NavGroup[];
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

export function AppShell({
  context,
  groups,
  account,
  user,
  unread,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const labItems = [
    ...(context ? [context.home] : []),
    ...groups.flatMap((group) => group.items),
  ];
  const current = activeItem(pathname, [...labItems, ...account]);

  // Navigating closes the menu, like following any link in a drawer should.
  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  const open = () => drawer.current?.showModal();
  const close = () => drawer.current?.close();

  const row = (item: NavItem, withHint: boolean) => (
    <Link
      key={item.key}
      href={item.href}
      aria-current={current?.key === item.key ? "page" : undefined}
      className="nav-row"
    >
      <NavIcon name={item.icon} className="nav-icon" />
      <span className="min-w-0">
        <span className="nav-label block">{item.label}</span>
        {withHint ? (
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
            {item.hint}
          </span>
        ) : null}
      </span>
    </Link>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-3">
          <button
            ref={opener}
            type="button"
            onClick={open}
            aria-label="Abrir menú"
            aria-haspopup="dialog"
            aria-controls="app-menu"
            className="grid size-11 place-items-center rounded-lg text-ink transition hover:bg-ink/5"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <Link
            href={context ? context.home.href : "/app"}
            className="grid size-8 flex-none place-items-center rounded-lg bg-guinda text-sm font-bold text-white"
            aria-label="Labora, inicio"
          >
            L
          </Link>

          <nav aria-label="Ubicación" className="min-w-0 flex-1 pl-2">
            <ol className="flex min-w-0 items-center gap-1 text-[0.9375rem]">
              {context ? (
                <li className="hidden min-w-0 truncate sm:block">
                  <Link
                    href={context.home.href}
                    className="truncate text-muted hover:text-ink"
                  >
                    {context.title}
                  </Link>
                </li>
              ) : null}
              {context && current && current.key !== "home" ? (
                <ChevronRight
                  aria-hidden
                  className="hidden size-4 flex-none text-muted sm:block"
                />
              ) : null}
              {current && current.key !== "home" ? (
                <li
                  aria-current="page"
                  className="min-w-0 truncate font-semibold"
                >
                  {current.label}
                </li>
              ) : context ? (
                <li className="min-w-0 truncate font-semibold sm:hidden">
                  {context.title}
                </li>
              ) : null}
            </ol>
          </nav>

          <Link
            href="/app/notifications"
            className="relative grid size-11 place-items-center rounded-lg text-ink transition hover:bg-ink/5"
            aria-label={
              unread > 0
                ? `Notificaciones ${unread > 99 ? "99+" : unread} sin leer`
                : "Notificaciones"
            }
          >
            <Bell aria-hidden className="size-5" />
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-guinda px-1 text-[0.6875rem] font-bold leading-4 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <span
            title={`${user.name}\n${user.email}`}
            className="grid size-9 flex-none place-items-center rounded-full bg-ink text-xs font-bold text-white"
          >
            {initials(user.name)}
          </span>
        </div>
      </header>

      <div className="flex">
        {/* Icon rail: always at hand on wide screens, labels in tooltips. */}
        <nav
          aria-label="Accesos rápidos"
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-16 flex-none flex-col items-center gap-1 overflow-y-auto border-r border-line bg-surface py-3 lg:flex"
        >
          {[
            // The bell in the top bar already leads to notifications.
            ...(context
              ? [[context.home]]
              : [account.filter((item) => item.key !== "notifications")]),
            ...groups.map((group) => group.items),
          ].map((items, index) => (
            <div
              key={index}
              className={`flex flex-col items-center gap-1 ${index > 0 ? "mt-1 border-t border-line pt-2" : ""}`}
            >
              {items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={current?.key === item.key ? "page" : undefined}
                  className="group relative grid size-11 place-items-center rounded-[0.625rem] text-ink transition hover:bg-ink/5 aria-[current=page]:bg-guinda-tint aria-[current=page]:text-guinda-deep"
                >
                  <NavIcon name={item.icon} className="nav-icon" />
                  <span className="sr-only">{item.label}</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-full z-40 ml-3 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-sm text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

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
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid size-8 flex-none place-items-center rounded-lg bg-guinda text-sm font-bold text-white">
              L
            </span>
            <p className="min-w-0 flex-1 truncate font-semibold">
              {context ? context.title : "Labora"}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar menú"
              className="grid size-10 place-items-center rounded-lg hover:bg-ink/5"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {context ? (
              <div className="mb-2">{row(context.home, false)}</div>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} className="mt-3 first:mt-0">
                <h2 className="flex items-center gap-2 px-3 pb-1.5 pt-2 text-[0.8125rem] font-semibold text-muted">
                  {group.step ? (
                    <span className="grid size-5 place-items-center rounded-full border border-current text-[0.6875rem]">
                      {group.step}
                    </span>
                  ) : null}
                  {group.title}
                </h2>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => row(item, true))}
                </div>
              </section>
            ))}

            <div className="mt-4 border-t border-line pt-3">
              <div className="px-3 pb-2 text-[0.8125rem]">
                <p className="truncate font-semibold">{user.name}</p>
                <p className="truncate text-muted">{user.email}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                {account.map((item) => row(item, false))}
                <LogoutButton variant="menu" />
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
