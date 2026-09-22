'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Button, Checkbox, InlineLoading, InlineNotification, TextArea, TextInput } from '@carbon/react'
import { Certificate, Key, Send } from '@carbon/icons-react'
import styles from './Claim.module.css'

function ClaimForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const skuParam = searchParams.get('sku') || ''
  const tokenParam = searchParams.get('token') || ''
  const [sku, setSku] = useState(skuParam)
  const [hasToken, setHasToken] = useState(true)
  const [claimToken, setClaimToken] = useState(tokenParam)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => { if (skuParam) setSku(skuParam); if (tokenParam) { setClaimToken(tokenParam); setHasToken(true) } }, [skuParam, tokenParam])
  useEffect(() => { async function checkAuth() { const { data: { session } } = await supabase.auth.getSession(); if (!session) { const redirectUrl = `/claim?sku=${encodeURIComponent(skuParam)}&token=${encodeURIComponent(tokenParam)}`; router.push(`/login?redirect=${encodeURIComponent(redirectUrl)}`) } else setUser(session.user) } checkAuth() }, [router, skuParam, tokenParam])

  const handleSubmit = async (event) => {
    event.preventDefault(); setLoading(true); setStatus({ type: '', text: '' })
    try {
      const response = await fetch('/api/artworks/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: sku.trim().toUpperCase(), claim_token: hasToken ? claimToken.trim() : null, user_message: !hasToken ? message.trim() : null, has_token: hasToken }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Ocurrió un error al procesar la reclamación.')
      setStatus({ type: hasToken ? 'success' : 'info', text: data.message || (hasToken ? 'La titularidad de la obra fue verificada y asignada a tu perfil.' : 'Tu solicitud fue enviada al Estudio JBU para revisión.') })
      setTimeout(() => router.push('/collection'), 2500)
    } catch (error) { setStatus({ type: 'error', text: error instanceof Error ? error.message : 'No fue posible procesar la reclamación.' }) }
    finally { setLoading(false) }
  }

  if (!user) return <div className={styles.loading}><InlineLoading description="Verificando sesión de coleccionista..." /></div>

  return <main className={styles.page}><div className={styles.shell}>
    <section className={styles.intro}><p className={styles.eyebrow}>Certificado digital de autenticidad</p><h1 className={styles.title}>Reclama la titularidad de tu obra</h1><p className={styles.lead}>Vincula la pieza física con tu colección privada y conserva su certificado digital dentro de tu cuenta.</p><ol className={styles.steps}><li className={styles.step}><span className={styles.stepNo}>01</span><span>Identifica la obra con el SKU incluido en tu documentación.</span></li><li className={styles.step}><span className={styles.stepNo}>02</span><span>Valida el código de reclamación o solicita una revisión manual.</span></li><li className={styles.step}><span className={styles.stepNo}>03</span><span>Consulta el certificado verificado desde tu colección.</span></li></ol></section>
    <section className={styles.formPanel} aria-labelledby="claim-form-title"><h2 id="claim-form-title" className={styles.sectionTitle}><Certificate size={20}/> Datos de la obra</h2>{status.text && <InlineNotification lowContrast kind={status.type === 'success' ? 'success' : status.type === 'info' ? 'info' : 'error'} title={status.type === 'success' ? 'Titularidad confirmada' : status.type === 'info' ? 'Solicitud enviada' : 'No fue posible continuar'} subtitle={status.text} hideCloseButton />}
      <form onSubmit={handleSubmit} className={styles.form}><TextInput id="sku-input" labelText="SKU de la obra" placeholder="Ej. DECO-2026-001" value={sku} onChange={(event) => setSku(event.target.value)} required helperText="Identificador único impreso en la documentación de la pieza." />
        <div className={styles.method}><p className={styles.methodLabel}>{hasToken ? 'Validación inmediata' : 'Revisión por el estudio'}</p><p className={styles.methodHelp}>{hasToken ? 'Usa el código único recibido con la obra.' : 'Describe cómo adquiriste la pieza para revisar su procedencia.'}</p><Checkbox id="no-token-checkbox" labelText="No tengo código de reclamación" checked={!hasToken} onChange={(_, { checked }) => setHasToken(!checked)} /></div>
        {hasToken ? <TextInput id="claim-token-input" labelText="Código de reclamación" placeholder="Ingresa tu código único" value={claimToken} onChange={(event) => setClaimToken(event.target.value)} required helperText="Lo encuentras en la documentación o en el correo de entrega." /> : <TextArea id="claim-message-input" labelText="Mensaje para el Estudio JBU" placeholder="Cuéntanos cómo y cuándo adquiriste la pieza..." value={message} onChange={(event) => setMessage(event.target.value)} required rows={5} helperText="El estudio revisará los registros antes de vincular la obra." />}
        <Button className={styles.submit} type="submit" disabled={loading} size="lg" renderIcon={hasToken ? Key : Send}>{loading ? 'Procesando...' : hasToken ? 'Validar y reclamar obra' : 'Enviar solicitud de revisión'}</Button>
      </form>
    </section>
  </div></main>
}

export default function ClaimPage() { return <Suspense fallback={<div className={styles.loading}><InlineLoading description="Cargando..." /></div>}><ClaimForm /></Suspense> }
