'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { 
  Tile, 
  Button, 
  TextInput, 
  Checkbox, 
  TextArea, 
  InlineLoading, 
  InlineNotification 
} from '@carbon/react'
import { Checkmark, Send, Key } from '@carbon/icons-react'

function ClaimForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Extraer SKU y TOKEN de los parámetros de URL
  const skuParam = searchParams.get('sku') || ''
  const tokenParam = searchParams.get('token') || ''

  const [sku, setSku] = useState(skuParam)
  const [hasToken, setHasToken] = useState(true)
  const [claimToken, setClaimToken] = useState(tokenParam)
  const [message, setMessage] = useState('')

  const [status, setStatus] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)

  // Sincronizar estados si cambian los parámetros de búsqueda
  useEffect(() => {
    if (skuParam) setSku(skuParam)
    if (tokenParam) {
      setClaimToken(tokenParam)
      setHasToken(true)
    }
  }, [skuParam, tokenParam])

  // Verificación de Sesión de Usuario
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const redirectUrl = `/claim?sku=${encodeURIComponent(skuParam)}&token=${encodeURIComponent(tokenParam)}`
        router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`)
      } else {
        setUser(session.user)
      }
    }
    checkAuth()
  }, [router, skuParam, tokenParam])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus({ type: '', text: '' })

    try {
      const res = await fetch('/api/artworks/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim().toUpperCase(),
          claim_token: hasToken ? claimToken.trim() : null,
          user_message: !hasToken ? message.trim() : null,
          has_token: hasToken
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Ocurrió un error al procesar la reclamación.')
      }

      if (hasToken) {
        setStatus({
          type: 'success',
          text: data.message || '¡Felicidades! La titularidad de la obra ha sido verificada y asignada a tu perfil exitosamente.'
        })
      } else {
        setStatus({
          type: 'info',
          text: data.message || 'Tu solicitud de reclamación ha sido enviada al Estudio JBU. Revisaremos los detalles y nos pondremos en contacto contigo pronto.'
        })
      }

      // Redirección a la colección privada del usuario
      setTimeout(() => {
        router.push('/collection')
      }, 2500)

    } catch (err) {
      setStatus({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <InlineLoading description="Verificando sesión de coleccionista..." />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '36rem', margin: '0 auto', padding: '3rem 1rem', boxSizing: 'border-box' }}>
      <Tile style={{ 
        backgroundColor: 'var(--cds-layer-01)', 
        border: '1px solid var(--cds-border-subtle)', 
        borderRadius: '1rem', 
        padding: '2rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.5rem',
        color: 'var(--cds-text-primary)'
      }}>

        {/* ENCABEZADO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', backgroundColor: 'rgba(241, 194, 27, 0.1)', color: '#f1c21b', border: '1px solid rgba(241, 194, 27, 0.2)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontFamily: 'var(--cds-code-font-family, monospace)' }}>
              Certificado Digital de Autenticidad
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, margin: '0.5rem 0 0 0' }}>
            Reclamar Titularidad de Obra
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--cds-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Asocia oficialmente una obra física de la colección JBU a tu cuenta de coleccionista.
          </p>
        </div>

        {/* NOTIFICACIÓN DE ESTADO */}
        {status.text && (
          <InlineNotification
            lowContrast
            kind={status.type === 'success' ? 'success' : status.type === 'info' ? 'info' : 'error'}
            title={status.type === 'success' ? '¡Éxito!' : status.type === 'info' ? 'Información' : 'Error'}
            subtitle={status.text}
            hideCloseButton
          />
        )}

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Identificador SKU */}
          <TextInput
            id="sku-input"
            labelText="SKU de la Obra *"
            placeholder="Ej. DECO-2026-001"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            helperText="Identificador único de la pieza artística."
          />

          {/* Toggle Claim Token / Mensaje */}
          <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--cds-border-subtle)' }}>
            <Checkbox
              id="no-token-checkbox"
              labelText="No tengo un Claim Token (Enviar mensaje de verificación al artista)"
              checked={!hasToken}
              onChange={(_, { checked }) => setHasToken(!checked)}
            />
          </div>

          {/* Opción A: Claim Token o Opción B: Mensaje Directo */}
          {hasToken ? (
            <TextInput
              id="claim-token-input"
              labelText="Claim Token *"
              placeholder="Ingresa tu código único"
              value={claimToken}
              onChange={(e) => setClaimToken(e.target.value)}
              required={hasToken}
              helperText="Lo encuentras adjunto en la documentación o correo de entrega enviado por el estudio."
            />
          ) : (
            <TextArea
              id="claim-message-input"
              labelText="Mensaje para el Estudio JBU *"
              placeholder="Platícanos cómo y cuándo adquiriste la pieza, o si requieres que emitamos un nuevo certificado para ti..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required={!hasToken}
              rows={4}
              helperText="Revisaremos los registros y coordinaremos la validación manual de tu pieza."
            />
          )}

          {/* BOTÓN DE ENVÍO */}
          <div style={{ marginTop: '0.5rem' }}>
            <Button
              type="submit"
              disabled={loading}
              kind="primary"
              size="lg"
              renderIcon={hasToken ? Key : Send}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'Procesando...' : hasToken ? 'Validar y Reclamar Obra' : 'Enviar Solicitud de Reclamación'}
            </Button>
          </div>

        </form>

      </Tile>
    </div>
  )
}

export default function ClaimPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <InlineLoading description="Cargando..." />
      </div>
    }>
      <ClaimForm />
    </Suspense>
  )
}