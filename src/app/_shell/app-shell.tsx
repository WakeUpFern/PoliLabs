"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Bell, Ellipsis, Plus, X } from "lucide-react";
import { LogoutButton } from "@/app/_components/logout-button";
import { NavIcon } from "./nav-icon";
import { NAV_GROUPS, type NavItem } from "./navigation";

type ShellProps = {
  /** The laboratory being worked in; absent on account pages. */
  laboratory: {
    name: string;
    href: string;
    sections: NavItem[];
    /** Keys of the sections on the phone's bottom bar. */
    quick: string[];
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

/** UPIITA's mark, the unit this laboratory belongs to. Decorative: the link around it is labelled. */
function Logo() {
  return (
    <Image
      src="/brand/upiita-mark.png"
      alt=""
      width={175}
      height={128}
      priority
      className="h-8 w-auto flex-none"
    />
  );
}

/**
 * Every section of the laboratory, grouped by intent. The same list is the
 * desktop sidebar and the phone's "Más" sheet, so both name it alike.
 */
function SectionList({
  sections,
  currentKey,
}: {
  sections: NavItem[];
  currentKey: string | undefined;
}) {
  const row = (item: NavItem) => (
    <li key={item.key}>
      <Link
        href={item.href}
        aria-current={currentKey === item.key ? "page" : undefined}
        className="nav-row"
      >
        <NavIcon name={item.icon} className="nav-icon" />
        <span className="nav-label">{item.label}</span>
        {item.counter ? (
          <span className="counter ml-auto">{item.counter}</span>
        ) : null}
      </Link>
    </li>
  );
  const ungrouped = sections.filter((item) => !item.group);
  return (
    <nav aria-label="Secciones del laboratorio" className="flex flex-col">
      <ul className="flex flex-col gap-0.5">{ungrouped.map(row)}</ul>
      {NAV_GROUPS.map((group) => {
        const items = sections.filter((item) => item.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key} className="mt-4">
            <p className="nav-group">{group.label}</p>
            <ul className="flex flex-col gap-0.5">{items.map(row)}</ul>
          </div>
        );
      })}
    </nav>
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
  const sheet = useRef<HTMLDialogElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);

  const sections = laboratory?.sections ?? [];
  const current = activeItem(pathname, [...sections, ...account]);
  const quick = (laboratory?.quick ?? [])
    .map((key) => sections.find((item) => item.key === key))
    .filter((item): item is NavItem => Boolean(item));
  const currentIsQuick = quick.some((item) => item.key === current?.key);

  // Following a link closes whatever menu it came from.
  useEffect(() => {
    sheet.current?.close();
    // Header menus are native popovers: a click outside or Escape closes them.
    header.current
      ?.querySelectorAll<HTMLElement>("[popover]")
      .forEach((menu) => menu.hidePopover());
  }, [pathname]);

  const closeSheet = () => sheet.current?.close();

  return (
    <div className="min-h-dvh">
      <header ref={header} className="topbar sticky top-0 z-30">
        <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link
            href={laboratory ? laboratory.href : "/app"}
            aria-label="Labora, inicio"
            className="-ml-1 grid min-h-11 place-items-center rounded-md px-1"
          >
            <Logo />
          </Link>
          <p className="min-w-0 flex-1 truncate font-bold">
            {laboratory ? (
              <Link href={laboratory.href} className="hover:underline">
                {laboratory.name}
              </Link>
            ) : (
              "Labora"
            )}
          </p>

          {laboratory && laboratory.create.length > 0 ? (
            <>
              <button
                type="button"
                popoverTarget="create-menu"
                aria-label="Crear"
                className="icon-btn"
              >
                <Plus aria-hidden className="size-4.5" />
              </button>
              <div
                id="create-menu"
                popover="auto"
                className="menu-popover w-60"
              >
                {laboratory.create.map((action) => (
                  <Link key={action.key} href={action.href} className="nav-row">
                    <NavIcon name={action.icon} className="nav-icon" />
                    <span className="nav-label">{action.label}</span>
                  </Link>
                ))}
              </div>
            </>
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

          <button
            type="button"
            popoverTarget="account-menu"
            aria-label="Cuenta"
            title={`${user.name}\n${user.email}`}
            className="grid size-11 cursor-pointer place-items-center rounded-full"
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/15 text-xs font-bold text-white ring-1 ring-white/30">
              {initials(user.name)}
            </span>
          </button>
          <div id="account-menu" popover="auto" className="menu-popover w-72">
            <div className="px-2.5 pt-1.5 pb-2.5 text-sm">
              <p className="truncate font-semibold">{user.name}</p>
              <p className="truncate text-muted">{user.email}</p>
            </div>
            <hr className="mb-1.5 border-line" />
            <nav aria-label="Cuenta" className="flex flex-col gap-0.5">
              {account.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={current?.key === item.key ? "page" : undefined}
                  className="nav-row"
                >
                  <NavIcon name={item.icon} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </Link>
              ))}
            </nav>
            {laboratories.length > 1 ? (
              <>
                <hr className="my-1.5 border-line" />
                <p className="nav-group">Tus laboratorios</p>
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
                      <span className="nav-label truncate">{lab.name}</span>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
            <hr className="my-1.5 border-line" />
            <LogoutButton variant="menu" />
          </div>
        </div>
      </header>

      <div className="lg:flex">
        {laboratory ? (
          <aside className="sidebar hidden lg:block">
            <SectionList sections={sections} currentKey={current?.key} />
          </aside>
        ) : null}

        <main
          className={`min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8 ${laboratory ? "pb-28 lg:pb-8" : ""}`}
        >
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {laboratory ? (
        <>
          <nav aria-label="Accesos rápidos" className="bottom-bar lg:hidden">
            <ul className="mx-auto flex max-w-lg">
              {quick.map((item) => {
                const active = current?.key === item.key;
                return (
                  <li key={item.key} className="min-w-0 flex-1">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={item.short ? item.label : undefined}
                      className="bottom-item"
                    >
                      <NavIcon name={item.icon} className="size-5.5" />
                      <span className="max-w-full truncate">
                        {item.short ?? item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
              <li className="min-w-0 flex-1">
                <button
                  ref={moreButton}
                  type="button"
                  onClick={() => sheet.current?.showModal()}
                  aria-haspopup="dialog"
                  aria-controls="more-sections"
                  data-active={current && !currentIsQuick ? "" : undefined}
                  className="bottom-item w-full"
                >
                  <Ellipsis aria-hidden className="size-5.5" />
                  <span>Más</span>
                </button>
              </li>
            </ul>
          </nav>

          <dialog
            ref={sheet}
            id="more-sections"
            aria-label="Más"
            className="sheet"
            onClick={(event) => {
              // A click on the backdrop lands on the dialog element itself.
              if (event.target === event.currentTarget) closeSheet();
            }}
            onClose={() => moreButton.current?.focus()}
          >
            <div className="flex max-h-[80dvh] flex-col overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="sticky top-0 z-10 flex h-12 items-center bg-surface">
                <span
                  aria-hidden
                  className="mx-auto h-1 w-10 rounded-full bg-line"
                />
                <button
                  type="button"
                  onClick={closeSheet}
                  aria-label="Cerrar"
                  className="absolute top-0.5 right-0 grid size-11 place-items-center rounded-md text-muted hover:bg-ink/6 hover:text-ink"
                >
                  <X aria-hidden className="size-5" />
                </button>
              </div>
              <SectionList sections={sections} currentKey={current?.key} />
            </div>
          </dialog>
        </>
      ) : null}
    </div>
  );
}
