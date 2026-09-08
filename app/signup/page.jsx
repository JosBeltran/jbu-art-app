'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import Image from 'next/image'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const router = useRouter()
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      })

      if (signUpError) throw signUpError

      router.push('/collection')
      router.refresh()
    } catch (err) {
      setError(err.message || 'Error al crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-2xl p-8 space-y-6">
        
        {/* Logo Monograma & Encabezado */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <div className="w-20 h-20 relative mb-1 p-2 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Monograma JBU"
              width={64}
              height={64}
              className="object-contain filter drop-shadow-md"
              priority
            />
          </div>

          <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
            Josué Beltrán Uresti — Registro
          </p>
          <h1 className="text-2xl font-serif font-light text-white">
            Crear Cuenta de Galería
          </h1>
          <p className="text-xs text-neutral-400">
            Registra tus datos para vincular y autenticar tus obras originales.
          </p>
        </div>

        {/* Alertas */}
        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-xs font-mono text-rose-300 text-center">
            {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-neutral-400 mb-1">
              Nombre Completo
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Sofía Martínez"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50 transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-neutral-400 mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50 transition"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-neutral-400 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-neutral-100 hover:bg-white text-neutral-950 font-mono text-xs font-bold rounded-lg shadow transition disabled:opacity-50 mt-2"
          >
            {loading ? 'Creando Cuenta...' : 'Registrar Colección 🏛️'}
          </button>
        </form>

        {/* Enlace a Login */}
        <div className="text-center border-t border-neutral-800/80 pt-4 text-xs font-mono text-neutral-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-amber-500 hover:underline">
            Iniciar Sesión
          </Link>
        </div>

      </div>
    </div>
  )
}