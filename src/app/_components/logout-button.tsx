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
      className={compact ? "btn" : "btn"}
    >
      {isPending ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
