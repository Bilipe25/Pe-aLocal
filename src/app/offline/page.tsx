import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Você está offline',
  description: 'Página de contingência offline do PedidoLocal.',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-[#FFFDF9] px-6 py-12 text-[#241C15]"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        background: '#FFFDF9',
        color: '#241C15',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <section className="w-full max-w-md text-center" aria-labelledby="offline-title">
        <div
          aria-hidden="true"
          className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-[#FDE8DC] text-[#D9480F]"
          style={{
            width: '4rem',
            height: '4rem',
            margin: '0 auto 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '1rem',
            background: '#FDE8DC',
            color: '#D9480F',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m2 2 20 20" />
            <path d="M8.5 8.5A7 7 0 0 1 19 10" />
            <path d="M5 12.6a10 10 0 0 1 .9-.7" />
            <path d="M12.6 18.5a1 1 0 1 1-1.2 0" />
            <path d="M8.5 15.5a5 5 0 0 1 1.5-.9" />
          </svg>
        </div>

        <h1 id="offline-title" className="font-heading text-3xl font-bold tracking-tight">
          Você está offline
        </h1>
        <p className="mt-3 text-base leading-7 text-[#6B625A]">
          Não conseguimos carregar esta página agora. Confira sua conexão e tente novamente.
        </p>

        <form method="get" action="" className="mt-8">
          <button
            type="submit"
            className="min-h-11 w-full rounded-xl bg-[#C2410C] px-5 py-3 font-semibold text-white transition-colors outline-none hover:bg-[#9A3412] focus-visible:ring-4 focus-visible:ring-[#F59E0B]/40"
            style={{
              minHeight: '44px',
              width: '100%',
              border: 0,
              borderRadius: '0.75rem',
              padding: '0.75rem 1.25rem',
              background: '#C2410C',
              color: '#FFFFFF',
              font: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </form>

        <p className="mt-5 text-sm leading-6 text-[#6B625A]">
          Seus dados não são enviados enquanto não houver conexão.
        </p>
      </section>
    </main>
  );
}
