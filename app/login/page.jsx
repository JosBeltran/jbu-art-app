'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import Image from 'next/image'
import { 
  Button, 
  TextInput, 
  InlineNotification 
} from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const user = data.user
      
      if (user) {
        // Consultamos el rol del usuario para decidir su destino exacto
        const [profileRes, userRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          supabase.from('users').select('role').eq('id', user.id).maybeSingle()
        ])

        const role = profileRes.data?.role || userRes.data?.role || ''
        const roleUpper = String(role).toUpperCase()
        const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'ADMINISTRADOR' || user.email === 'josue.beltran.u@gmail.com'

        // Redirección inteligente basada en rol
        if (isAdmin) {
          window.location.href = '/admin'
        } else {
          window.location.href = '/profile'
        }
      } else {
        window.location.href = '/profile'
      }
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row', backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}>
      
      {/* COLUMNA IZQUIERDA: Marca / Logo Grande */}
      <div style={{ 
        flex: 1, 
        backgroundColor: 'var(--cds-layer-01)', 
        borderRight: '1px solid var(--cds-border-subtle01)', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between', 
        padding: '4rem'
      }}>
        <div>
          <span className="cds--label" style={{ color: 'var(--cds-support-warning)', fontFamily: 'monospace' }}>
            Estudio JBU — Plataforma de Gestión
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
          <div style={{ 
            width: '8rem', 
            height: '8rem', 
            backgroundColor: 'var(--cds-layer-02)', 
            border: '1px solid var(--cds-border-subtle01)', 
            borderRadius: '16px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '1.5rem',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)'
          }}>
            <Image
              src="/logo.png"
              alt="Josué Beltrán Uresti"
              width={96}
              height={96}
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '300', letterSpacing: '-0.5px', margin: '0 0 0.5rem 0' }}>
              Colección Privada
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', maxWidth: '20rem', margin: 0, lineHeight: '1.5' }}>
              Trazabilidad, autenticidad y gestión centralizada de obra contemporánea y certificados digitales.
            </p>
          </div>
        </div>

        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          © {new Date().getFullYear()} Josué Beltrán Uresti. Todos los derechos reservados.
        </div>
      </div>

      {/* COLUMNA DERECHA: Formulario de Acceso */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '2.5rem' 
      }}>
        <div style={{ width: '100%', maxWidth: '28rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span className="cds--label" style={{ color: 'var(--cds-support-warning)' }}>
              Acceso al Sistema
            </span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: '400', margin: 0, letterSpacing: '-0.5px' }}>
              Iniciar Sesión
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
              Ingresa tus credenciales para acceder al panel.
            </p>
          </div>

          {error && (
            <InlineNotification
              kind="error"
              title="Error de autenticación"
              subtitle={error}
              lowContrast
            />
          )}

          <Button
            onClick={handleGoogleLogin}
            kind="secondary"
            size="lg"
            renderIcon={(props) => (
              <svg {...props} viewBox="0 0 24 24" style={{ width: '1rem', height: '1rem' }}>
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12s.7 2.3 1.9 4.7l3.7-2.9z" />
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z" />
              </svg>
            )}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Continuar con Google
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', gap: '1rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--cds-border-subtle01)' }} />
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>
              o correo electrónico
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--cds-border-subtle01)' }} />
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <TextInput
              id="email"
              labelText="Correo electrónico"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />

            <TextInput
              id="password"
              labelText="Contraseña"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button
              type="submit"
              disabled={loading}
              renderIcon={ArrowRight}
              size="lg"
              style={{ width: '100%', justifyContent: 'space-between', marginTop: '0.5rem' }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>

          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.5rem' }}>
            <p style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', margin: 0 }}>
              ¿Aún no tienes cuenta?{' '}
              <Link href="/signup" style={{ color: 'var(--cds-link-primary)', textDecoration: 'underline' }}>
                Regístrate aquí
              </Link>
            </p>
          </div>

        </div>
      </div>

    </div>
  )
}