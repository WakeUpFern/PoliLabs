import Image from "next/image";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/modules/identity/infrastructure/auth";
import { getCurrentUser } from "@/modules/identity/infrastructure/services";
import { InactiveUserError } from "@/modules/identity/domain/access-errors";
import { safeReturnPath } from "@/modules/identity/domain/return-path";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string; next?: string }>;
};

const messages: Record<string, string> = {
  logout: "La sesión se cerró correctamente.",
  "session-ended": "Tu sesión terminó. Inicia sesión de nuevo para continuar.",
  "account-inactive":
    "Tu cuenta no está activa. Solicita ayuda a la persona responsable de tu laboratorio.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [query, session] = await Promise.all([
    searchParams,
    auth.api.getSession({ headers: await headers() }),
  ]);
  let reason = query.reason;
  let clearExistingSession = false;

  if (session) {
    try {
      await getCurrentUser.execute(session.user.id);
      redirect(safeReturnPath(query.next));
    } catch (error) {
      if (!(error instanceof InactiveUserError)) throw error;
      clearExistingSession = true;
      reason = "account-inactive";
    }
  }

  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)]">
      <section className="hidden bg-guinda p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/upiita-mark.png"
            alt=""
            width={175}
            height={128}
            priority
            className="h-10 w-auto"
          />
          <p className="text-xl font-bold">PoliLabs</p>
        </div>
        <p className="max-w-lg text-2xl leading-snug font-semibold">
          Prácticas, reservaciones, préstamos e inventario de los laboratorios
          de UPIITA.
        </p>
        <p className="text-sm text-white/75">UPIITA · IPN</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <p className="mb-6 text-lg font-bold text-guinda lg:hidden">
            PoliLabs
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Inicia sesión
          </h1>
          <p className="mt-3 leading-7 text-muted">
            Usa la cuenta que te dio el responsable de tu laboratorio.
          </p>
          <LoginForm
            returnPath={safeReturnPath(query.next)}
            initialMessage={reason ? messages[reason] : undefined}
            clearExistingSession={clearExistingSession}
          />
          <p className="mt-8 text-sm leading-6 text-muted">
            Lo que puedes ver y hacer depende de tu papel en cada laboratorio.
          </p>
        </div>
      </section>
    </main>
  );
}
