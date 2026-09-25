import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/modules/identity/infrastructure/auth";
import { getCurrentUser } from "@/modules/identity/infrastructure/services";
import { InactiveUserError } from "@/modules/identity/domain/access-errors";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string }>;
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
      redirect("/app");
    } catch (error) {
      if (!(error instanceof InactiveUserError)) throw error;
      clearExistingSession = true;
      reason = "account-inactive";
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f6f3ee] lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)]">
      <section className="relative hidden overflow-hidden bg-[#641229] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_15%,white_0,transparent_32%),radial-gradient(circle_at_80%_85%,#d4a85f_0,transparent_28%)]" />
        <p className="relative text-sm font-semibold tracking-[0.24em] text-white/75">
          LABORA · POLILABS
        </p>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#e2c68f]">
            Gestión de laboratorios
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight xl:text-6xl">
            El trabajo del laboratorio, en un solo lugar.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/72">
            Accede a los laboratorios en los que participas y continúa desde un
            contexto seguro y autorizado.
          </p>
        </div>
        <p className="relative text-sm text-white/60">UPIITA · IPN</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <p className="text-sm font-bold tracking-[0.22em] text-[#7a1731] lg:hidden">
            LABORA
          </p>
          <p className="text-sm font-semibold text-[#7a1731]">Bienvenido</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
            Inicia sesión
          </h2>
          <p className="mt-3 leading-7 text-stone-600">
            Usa la cuenta local proporcionada por el responsable de tu
            laboratorio.
          </p>
          <LoginForm
            initialMessage={reason ? messages[reason] : undefined}
            clearExistingSession={clearExistingSession}
          />
          <p className="mt-8 text-center text-xs leading-5 text-stone-500">
            El acceso y las acciones disponibles dependen de tu membresía activa
            en cada laboratorio.
          </p>
        </div>
      </section>
    </main>
  );
}
