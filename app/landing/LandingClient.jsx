'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'

function formatPrice(a) {
  const n = Number(a?.calculated_price_mxn ?? a?.base_price_mxn)
  if (!n || Number.isNaN(n)) return null
  return `$${n.toLocaleString('es-MX')} MXN`
}

function isAvailable(a) {
  const s = `${a?.status ?? ''} ${a?.ownership_status ?? ''}`.toLowerCase()
  return s.includes('avail') || s.includes('disponible')
}

export default function LandingClient({ hero, artworks }) {
  const [dark, setDark] = useState(false)

  const bg = dark ? 'bg-[#0a0a0a] text-[#f4f1ea]' : 'bg-[#fdfbf7] text-[#0a0a0a]'
  const subtle = 'text-neutral-500'
  const line = dark ? 'border-white/10' : 'border-black/10'

  return (
    <div className={`min-h-screen antialiased selection:bg-[#d97706] selection:text-white ${bg}`}>
      {/* ================= NAV ================= */}
      <header className="fixed top-0 left-0 z-50 flex w-full items-center justify-between px-6 py-5 mix-blend-difference text-white">
        <Link href="/landing" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-sm bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jbu-logo.png" alt="JBU" className="h-6 w-6 object-contain" />
          </span>
          <span className="text-sm font-light uppercase tracking-[0.3em]">JBU</span>
        </Link>

        <nav className="flex items-center gap-6 text-[11px] uppercase tracking-[0.25em]">
          <Link href="/catalog" className="transition-opacity hover:opacity-60">
            Obras
          </Link>
          <Link href="/login" className="transition-opacity hover:opacity-60">
            Entrar
          </Link>
          <button
            onClick={() => setDark(!dark)}
            className="uppercase tracking-[0.25em] transition-opacity hover:opacity-60"
          >
            {dark ? 'Claro' : 'Oscuro'}
          </button>
        </nav>
      </header>

      {/* ================= HERO ================= */}
      {hero && (
        <Link href={`/artwork/${hero.sku}`} className="group relative block h-screen w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.primary_image_url}
            alt={hero.title}
            className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
          />

          <p className="absolute bottom-6 left-6 text-[10px] uppercase tracking-[0.3em] text-white mix-blend-difference">
            {hero.series} · {hero.year}
          </p>

          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-8 opacity-0 transition-opacity duration-500 group-hover:opacity-100 md:p-12">
            <h1 className="text-3xl font-light text-white md:text-5xl">{hero.title}</h1>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/70">
              {hero.medium} · {hero.dimensions}
            </p>
            {formatPrice(hero) && (
              <p className="mt-3 flex items-center gap-2 text-sm text-white">
                <span className={`h-1.5 w-1.5 rounded-full ${isAvailable(hero) ? 'bg-[#d97706]' : 'bg-white/60'}`} />
                {formatPrice(hero)}
              </p>
            )}
          </div>
        </Link>
      )}

      {/* ================= CARRUSEL ================= */}
      {artworks.length > 0 && (
        <section className="py-20 md:py-28">
          <div className="mb-10 flex items-baseline justify-between px-6 md:px-12">
            <h2 className="text-[11px] uppercase tracking-[0.3em]">Obras destacadas</h2>
            <span className={`text-[10px] uppercase tracking-[0.2em] ${subtle}`}>Desliza →</span>
          </div>

          <div className="flex gap-4 overflow-x-auto px-6 pb-4 md:px-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {artworks.map((a) => (
              <Link
                key={a.id}
                href={`/artwork/${a.sku}`}
                className="group relative block w-[70vw] shrink-0 overflow-hidden sm:w-[42vw] md:w-[30vw] lg:w-[24vw]"
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.primary_image_url}
                    alt={a.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  />
                </div>

                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/0 to-black/0 p-5 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <h3 className="text-lg font-light text-white">{a.title}</h3>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/70">
                    {a.series} · {a.medium} · {a.dimensions} · {a.year}
                  </p>
                  {formatPrice(a) && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-white">
                      <span className={`h-1.5 w-1.5 rounded-full ${isAvailable(a) ? 'bg-[#d97706]' : 'bg-white/60'}`} />
                      {isAvailable(a) ? formatPrice(a) : 'Colección privada'}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ================= CATÁLOGO ================= */}
      <section className={`border-t ${line} px-6 py-16 md:px-12`}>
        <Link
          href="/catalog"
          className="group inline-flex items-center gap-3 text-xl font-light md:text-3xl"
        >
          Ver catálogo completo
          <ArrowRight size={24} className="transition-transform duration-300 group-hover:translate-x-2" />
        </Link>
      </section>

      {/* ================= MANIFIESTO ================= */}
      <section className={`border-t ${line} px-6 py-28 text-center md:py-40`}>
        <p className="mx-auto max-w-2xl text-2xl font-light leading-snug md:text-4xl">
          “La pintura es un lugar de espera.”
        </p>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className={`flex flex-col items-start justify-between gap-6 border-t ${line} px-6 py-10 md:flex-row md:items-center md:px-12`}>
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-sm bg-white ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jbu-logo.png" alt="JBU" className="h-5 w-5 object-contain" />
          </span>
          <span className={`text-[10px] uppercase tracking-[0.25em] ${subtle}`}>
            © 2026 JBU · Monterrey, N.L.
          </span>
        </div>

        <nav className={`flex gap-6 text-[10px] uppercase tracking-[0.25em] ${subtle}`}>
          <Link href="/login" className="transition-colors hover:opacity-60">Iniciar sesión</Link>
          <Link href="/profile" className="transition-colors hover:opacity-60">Coleccionista</Link>
          <Link href="/admin" className="transition-colors hover:opacity-60">Admin</Link>
        </nav>
      </footer>
    </div>
  )
}
