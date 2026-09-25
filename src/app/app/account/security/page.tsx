import { PasswordForm } from "./password-form";

export default function SecurityPage() {
  return (
    <div>
      <p className="text-sm font-semibold text-[#7a1731]">Cuenta</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Seguridad
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-stone-600">
        Actualiza la contraseña de tu cuenta local. Tu sesión actual seguirá
        activa y las demás sesiones se revocarán inmediatamente.
      </p>

      <section className="mt-8 max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold">Cambiar contraseña</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
