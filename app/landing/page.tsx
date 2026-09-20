'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowRight, Menu, Close } from '@carbon/icons-react'

export default function LandingPage() {
  const [heroArtwork, setHeroArtwork] = useState<any>(null)
  const [selectedWorks, setSelectedWorks] = useState<any[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  // Carga inicial de datos de ejemplo o desde Supabase
  useEffect(() => {
    const fetchLandingData = async () => {
      // Intentamos traer una obra destacada para el Hero
      const { data: featured } = await supabase
        .from('artworks')
        .select('*')
        .eq('featured', true)
        .limit(1)
        .single()

      if (featured) {
        setHeroArtwork(featured)
      }

      // Obras para la selección editorial
      const { data: works } = await supabase
        .from('artworks')
        .select('*')
        .limit(3)

      if (works) {
        setSelectedWorks(works)
      }
    }

    fetchLandingData()
  }, [])

  return (
    <div className="bg-[#0f0f0f] text-[#f4f4f4] min-h-screen selection:bg-[#333] selection:text-white font-sans antialiased">
      
      {/* Navegación Minimalista Editorial */}
      <header className="fixed top-0 left-0 w-full z-50 px-6 py-6 flex justify-between items-center backdrop-blur-md bg-[#0f0f0f]/60 border-b border-white/5">
        <Link href="/landing" className="tracking-[0.25em] text-sm uppercase font-light">
          JBU <span className="text-xs text-neutral-500 block">Josué Beltrán Uresti</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8 text-xs tracking-widest uppercase text-neutral-400">
          <Link href="#work" className="hover:text-white transition-colors">The Work</Link>
          <Link href="#collections" className="hover:text-white transition-colors">Collections</Link>
          <Link href="#studio" className="hover:text-white transition-colors">Studio</Link>
          <Link href="/catalog" className="text-white border-b border-white/40 pb-1 hover:border-white transition-all flex items-center gap-1">
            Catalog <ArrowRight size={12} />
          </Link>
        </nav>

        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden text-white focus:outline-none"
        >
          {menuOpen ? <Close size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Menú móvil desplegable */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-[#0f0f0f] flex flex-col justify-center items-center gap-6 text-sm tracking-widest uppercase md:hidden">
          <Link href="#work" onClick={() => setMenuOpen(false)}>The Work</Link>
          <Link href="#collections" onClick={() => setMenuOpen(false)}>Collections</Link>
          <Link href="#studio" onClick={() => setMenuOpen(false)}>Studio</Link>
          <Link href="/catalog" onClick={() => setMenuOpen(false)} className="text-neutral-400">Enter Catalog</Link>
        </div>
      )}

      {/* Hero / Imagen Principal Protagonista */}
      <section className="relative h-screen w-full flex flex-col justify-end px-6 md:px-16 pb-16 pt-32">
        <div className="absolute inset-0 z-0 overflow-hidden">
          {heroArtwork?.primary_image_url ? (
            <img 
              src={heroArtwork.primary_image_url} 
              alt={heroArtwork.title || 'JBU Featured Artwork'} 
              className="w-full h-full object-cover opacity-60 scale-105 transition-transform duration-1000"
            />
          ) : (
            <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-neutral-700 text-xs tracking-widest uppercase">
              [ Imagen Principal / Dinámica desde Supabase ]
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-transparent to-transparent opacity-80" />
        </div>

        <div className="relative z-10 max-w-4xl">
          <span className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 block mb-2">
            Featured Piece {heroArtwork?.year ? `— ${heroArtwork.year}` : ''}
          </span>
          <h1 className="text-3xl md:text-6xl font-extralight tracking-tight mb-4">
            {heroArtwork?.title || 'Imposed Order & Flow'}
          </h1>
          <p className="text-sm md:text-base text-neutral-300 font-light max-w-xl leading-relaxed mb-6">
            {heroArtwork?.medium || 'Técnica mixta sobre lienzo y resina epóxica'} {heroArtwork?.dimensions ? `• ${heroArtwork.dimensions}` : ''}
          </p>
          <Link 
            href="/catalog" 
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-white border-b border-white pb-1 hover:opacity-75 transition-opacity"
          >
            Explorar Archivo Completo <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Sección: The Work / Selección Editorial */}
      <section id="work" className="py-32 px-6 md:px-16 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 border-b border-white/10 pb-6">
          <div>
            <span className="text-[10px] tracking-[0.3em] uppercase text-neutral-500 block mb-2">Curaduría</span>
            <h2 className="text-2xl md:text-4xl font-extralight">Selected Works</h2>
          </div>
          <Link href="/catalog" className="text-xs tracking-widest uppercase text-neutral-400 hover:text-white transition-colors mt-4 md:mt-0">
            Ver todas las obras &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
          {selectedWorks.map((work, idx) => (
            <div key={work.id || idx} className={`flex flex-col gap-4 ${idx === 1 ? 'md:translate-y-16' : ''}`}>
              <div className="aspect-[4/5] bg-neutral-900 overflow-hidden relative group">
                {work.primary_image_url ? (
                  <img 
                    src={work.primary_image_url} 
                    alt={work.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-700 text-xs">Sin imagen</div>
                )}
              </div>
              <div className="flex justify-between items-baseline">
                <div>
                  <h3 className="text-sm tracking-wider uppercase font-light">{work.title}</h3>
                  <span className="text-xs text-neutral-500 font-light">{work.medium} • {work.year}</span>
                </div>
                <span className="text-xs font-mono text-neutral-400">${work.base_price_mxn || 'Consultar'} MXN</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sección: Studio / Manifiesto */}
      <section id="studio" className="py-32 px-6 md:px-16 border-t border-white/5 bg-[#121212]">
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-8">
          <span className="text-[10px] tracking-[0.3em] uppercase text-neutral-500">El Estudio</span>
          <h2 className="text-2xl md:text-4xl font-extralight leading-snug">
            Exploración matérica entre resina, pigmento y geometría rigurosa.
          </h2>
          <p className="text-sm text-neutral-400 font-light leading-relaxed">
            Cada pieza nace de la tensión entre el orden estructural y el comportamiento orgánico de los materiales. Un archivo vivo en Monterrey, N.L. que documenta la evolución del arte contemporáneo y sus intersecciones digitales.
          </p>
          <div className="pt-4">
            <Link 
              href="/catalog" 
              className="inline-block border border-white/20 px-8 py-4 text-xs tracking-widest uppercase hover:bg-white hover:text-black transition-all"
            >
              Entrar al Catálogo Oficial
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Editorial */}
      <footer className="py-16 px-6 md:px-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-xs tracking-widest text-neutral-500 gap-6">
        <div>
          JBU &copy; {new Date().getFullYear()} • Josué Beltrán Uresti
        </div>
        <div className="flex gap-8 uppercase">
          <Link href="/catalog" className="hover:text-white transition-colors">Catalog</Link>
          <Link href="/login" className="hover:text-white transition-colors">Collector Login</Link>
        </div>
      </footer>

    </div>
  )
}