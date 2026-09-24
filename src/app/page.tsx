export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="mb-6 text-sm font-semibold tracking-widest text-[#800020]">
        UPIITA · LABORATORIO DE PESADOS
      </p>
      <h1 className="text-6xl font-semibold tracking-tight sm:text-8xl">
        Labora
      </h1>
      <p className="mt-6 max-w-xl text-xl leading-relaxed">
        Un espacio para la gestión académica y operativa de nuestros
        laboratorios.
      </p>
      <div className="mt-12 border-t border-stone-300 pt-6">
        <h2 className="text-lg font-semibold">
          Estamos preparando el laboratorio digital
        </h2>
        <p className="mt-2 max-w-xl text-stone-600">
          La plataforma está en desarrollo. Las funciones académicas y
          operativas estarán disponibles en próximas etapas.
        </p>
      </div>
    </main>
  );
}
