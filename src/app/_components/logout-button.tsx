"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/identity/infrastructure/auth-client";

export function LogoutButton({
  compact = false,
  variant,
}: {
  compact?: boolean;
  variant?: "menu";
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    const { error } = await authClient.signOut();
    if (error) {
      setIsPending(false);
      return;
    }
    router.replace("/login?reason=logout");
    router.refresh();
  }

  if (variant === "menu")
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="nav-row w-full disabled:cursor-wait disabled:opacity-60"
      >
        <LogOut aria-hidden className="nav-icon" />
        <span className="nav-label">
          {isPending ? "Cerrando…" : "Cerrar sesión"}
        </span>
      </button>
    );

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className={
        compact
          ? "rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-500 hover:text-stone-950 disabled:cursor-wait disabled:opacity-60"
          : "inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60"
      }
    >
      {isPending ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
