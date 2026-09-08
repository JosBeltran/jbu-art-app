'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { useCart } from '@/context/CartContext'
import CartDrawer from '@/components/CartDrawer'

export default function Navbar() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const { cart } = useCart()
  const itemCount = cart.reduce((acc, item) => acc + (item.quantity || 1), 0)

  const dropdownRef = useRef(null)
  const router = useRouter()
  const pathname = usePathname()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  useEffect(() => {
    const fetchSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        setUser(session.user)

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (profileData) {
          setProfile(profileData)
        }
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    }

    fetchSessionAndProfile()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchSessionAndProfile()
      } else {
        setUser(null)
        setProfile(null)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setMenuOpen(false)
    router.push('/login')
    router.refresh()
  }

  const isAdmin = profile?.role === 'admin'
  const userInitials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : user?.email ? user.email.substring(0, 2).toUpperCase() : 'JBU'

  return (
    <>
      <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          
          {/* LOGO E IDENTIDAD */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-8 h-8 relative bg-neutral-900 border border-neutral-700/60 rounded-lg p-1 group-hover:border-amber-500/50 transition">
              <Image
                src="/logo.png"
                alt="Estudio JBU"
                width={28}
                height={28}
                className="object-contain"
              />
            </div>
            <span className="font-serif font-light text-sm tracking-widest text-white uppercase group-hover:text-amber-400 transition">
              Josué Beltrán Uresti
            </span>
          </Link>

          {/* ACCIONES DEL NAVBAR: CARRITO Y USUARIO */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            
            {/* BOTÓN DEL CARRITO */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="relative flex items-center justify-center p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 text-neutral-300 hover:text-white transition group focus:outline-none"
              title="Ver Carrito de Compras"
            >
              <svg className="w-5 h-5 group-hover:scale-105 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>

              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-neutral-950 font-mono font-bold text-[10px] rounded-full w-5 h-5 flex items-center justify-center shadow-lg border border-neutral-950 animate-in zoom-in-50">
                  {itemCount}
                </span>
              )}
            </button>

            {/* ÁREA DE USUARIO */}
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 animate-pulse" />
            ) : !user ? (
              <Link
                href="/login"
                className="text-xs font-mono text-neutral-400 hover:text-white px-3 py-1.5 transition"
              >
                Iniciar Sesión
              </Link>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center space-x-2.5 p-1.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-left transition focus:outline-none"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                    isAdmin 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  }`}>
                    {userInitials}
                  </div>

                  <div className="hidden sm:block text-left pr-1">
                    <p className="text-xs font-serif font-medium text-white truncate max-w-[130px]">
                      {profile?.full_name || 'Josué Beltrán Uresti'}
                    </p>
                  </div>

                  <svg
                    className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* DROPDOWN MENU */}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-2 space-y-1 backdrop-blur-xl z-50">
                    
                    {/* ENCABEZADO PERFIL */}
                    <div className="px-3 py-2.5 border-b border-neutral-800/80 mb-1">
                      <p className="text-xs font-serif text-white font-medium truncate">
                        {profile?.full_name || 'Josué Beltrán Uresti'}
                      </p>
                      <p className="text-[10px] font-mono text-neutral-400 truncate">
                        {user.email}
                      </p>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">
                          Nivel de Perfil
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          isAdmin 
                            ? 'bg-amber-950 text-amber-400 border border-amber-500/30' 
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {isAdmin ? 'ADMINISTRADOR' : (profile?.tier_level || 'Coleccionista')}
                        </span>
                      </div>
                    </div>

                    {/* SECCIÓN COLECCIONISTA */}
                    <div className="space-y-0.5">
                      <p className="px-3 pt-1 text-[9px] font-mono uppercase tracking-widest text-neutral-500">
                        Colección Privada
                      </p>
                      <Link
                        href="/collection"
                        className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-mono text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
                      >
                        <span>🖼️</span>
                        <span>Mi Colección Privada</span>
                      </Link>
                    </div>

                    {/* SECCIÓN ADMINISTRADOR */}
                    {isAdmin && (
                      <div className="pt-1.5 border-t border-neutral-800/80 space-y-0.5">
                        <p className="px-3 pt-1 text-[9px] font-mono uppercase tracking-widest text-amber-500 font-bold">
                          Estudio / Administración
                        </p>
                        
                        <Link
                          href="/admin/certificates"
                          className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-mono text-amber-300 hover:bg-amber-500/10 hover:text-amber-400 transition"
                        >
                          <span>📜</span>
                          <span>Aprobación de Certificados</span>
                        </Link>

                        <Link
                          href="/admin/artworks"
                          className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-mono text-amber-300 hover:bg-amber-500/10 hover:text-amber-400 transition"
                        >
                          <span>📁</span>
                          <span>Inventario de Obras</span>
                        </Link>

                        <Link
                          href="/admin/users"
                          className="flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-mono text-amber-300 hover:bg-amber-500/10 hover:text-amber-400 transition"
                        >
                          <span>👥</span>
                          <span>Directorio de Usuarios</span>
                        </Link>
                      </div>
                    )}

                    {/* CERRAR SESIÓN */}
                    <div className="pt-1.5 border-t border-neutral-800/80">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-mono text-red-400 hover:bg-red-950/40 transition text-left"
                      >
                        <span>🚪</span>
                        <span>Cerrar Sesión</span>
                      </button>
                    </div>

                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </header>

      {/* COMPONENTE DRAWER LATERAL DEL CARRITO */}
      <CartDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  )
}