'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { Button, Checkbox, InlineLoading, InlineNotification, TextArea, TextInput } from '@carbon/react'
import { Certificate, Key, Send } from '@carbon/icons-react'
import styles from './Claim.module.css'

function ClaimForm() {
  const { t } = useI18n()
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
      if (!response.ok) throw new Error(data.message || data.error || t('Ocurrió un error al procesar la reclamación.', 'An error occurred while processing the claim.'))
      setStatus({ type: hasToken ? 'success' : 'info', text: data.message || (hasToken ? t('La titularidad de la obra fue verificada y asignada a tu perfil.', 'Ownership of the artwork was verified and assigned to your profile.') : t('Tu solicitud fue enviada al Estudio JBU para revisión.', 'Your request was sent to JBU Studio for review.')) })
      setTimeout(() => router.push('/collection'), 2500)
    } catch (error) { setStatus({ type: 'error', text: error instanceof Error ? error.message : t('No fue posible procesar la reclamación.', 'It was not possible to process the claim.') }) }
    finally { setLoading(false) }
  }

  if (!user) return <div className={styles.loading}><InlineLoading description={t('Verificando sesión de coleccionista...', 'Verifying collector session...')} /></div>

  return <main className={styles.page}><div className={styles.shell}>
    <section className={styles.intro}><p className={styles.eyebrow}>{t('Certificado digital de autenticidad', 'Digital certificate of authenticity')}</p><h1 className={styles.title}>{t('Reclama la titularidad de tu obra', 'Claim ownership of your artwork')}</h1><p className={styles.lead}>{t('Vincula la pieza física con tu colección privada y conserva su certificado digital dentro de tu cuenta.', 'Link the physical piece to your private collection and keep its digital certificate within your account.')}</p><ol className={styles.steps}><li className={styles.step}><span className={styles.stepNo}>01</span><span>{t('Identifica la obra con el SKU incluido en tu documentación.', 'Identify the artwork with the SKU included in your documentation.')}</span></li><li className={styles.step}><span className={styles.stepNo}>02</span><span>{t('Valida el código de reclamación o solicita una revisión manual.', 'Validate the claim code or request a manual review.')}</span></li><li className={styles.step}><span className={styles.stepNo}>03</span><span>{t('Consulta el certificado verificado desde tu colección.', 'View the verified certificate from your collection.')}</span></li></ol></section>
    <section className={styles.formPanel} aria-labelledby="claim-form-title"><h2 id="claim-form-title" className={styles.sectionTitle}><Certificate size={20}/> {t('Datos de la obra', 'Artwork details')}</h2>{status.text && <InlineNotification lowContrast kind={status.type === 'success' ? 'success' : status.type === 'info' ? 'info' : 'error'} title={status.type === 'success' ? t('Titularidad confirmada', 'Ownership confirmed') : status.type === 'info' ? t('Solicitud enviada', 'Request sent') : t('No fue posible continuar', 'It was not possible to continue')} subtitle={status.text} hideCloseButton />}
      <form onSubmit={handleSubmit} className={styles.form}><TextInput id="sku-input" labelText={t('SKU de la obra', 'Artwork SKU')} placeholder={t('Ej. DECO-2026-001', 'E.g. DECO-2026-001')} value={sku} onChange={(event) => setSku(event.target.value)} required helperText={t('Identificador único impreso en la documentación de la pieza.', 'Unique identifier printed on the piece documentation.')} />
        <div className={styles.method}><p className={styles.methodLabel}>{hasToken ? t('Validación inmediata', 'Immediate validation') : t('Revisión por el estudio', 'Review by the studio')}</p><p className={styles.methodHelp}>{hasToken ? t('Usa el código único recibido con la obra.', 'Use the unique code received with the artwork.') : t('Describe cómo adquiriste la pieza para revisar su procedencia.', 'Describe how you acquired the piece so we can review its provenance.')}</p><Checkbox id="no-token-checkbox" labelText={t('No tengo código de reclamación', "I don't have a claim code")} checked={!hasToken} onChange={(_, { checked }) => setHasToken(!checked)} /></div>
        {hasToken ? <TextInput id="claim-token-input" labelText={t('Código de reclamación', 'Claim code')} placeholder={t('Ingresa tu código único', 'Enter your unique code')} value={claimToken} onChange={(event) => setClaimToken(event.target.value)} required helperText={t('Lo encuentras en la documentación o en el correo de entrega.', 'You can find it in the documentation or in the delivery email.')} /> : <TextArea id="claim-message-input" labelText={t('Mensaje para el Estudio JBU', 'Message for JBU Studio')} placeholder={t('Cuéntanos cómo y cuándo adquiriste la pieza...', 'Tell us how and when you acquired the piece...')} value={message} onChange={(event) => setMessage(event.target.value)} required rows={5} helperText={t('El estudio revisará los registros antes de vincular la obra.', 'The studio will review the records before linking the artwork.')} />}
        <Button className={styles.submit} type="submit" disabled={loading} size="lg" renderIcon={hasToken ? Key : Send}>{loading ? t('Procesando...', 'Processing...') : hasToken ? t('Validar y reclamar obra', 'Validate and claim artwork') : t('Enviar solicitud de revisión', 'Send review request')}</Button>
      </form>
    </section>
  </div></main>
}

export default function ClaimPage() {
  const { t } = useI18n()
  return <Suspense fallback={<div className={styles.loading}><InlineLoading description={t('Cargando...', 'Loading...')} /></div>}><ClaimForm /></Suspense>
}
