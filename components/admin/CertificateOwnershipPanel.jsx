'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, InlineLoading, InlineNotification, Modal, RadioButton, RadioButtonGroup, Search, Tag, TextArea, TextInput } from '@carbon/react'
import { Certificate, Download, Launch, Renew, UserFollow } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import styles from './CertificateOwnershipPanel.module.css'

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` }
}

const STATE_TAG = { NOT_CLAIMED: 'gray', CLAIM_PENDING: 'purple', VERIFIED: 'green', MANUALLY_ASSIGNED: 'teal' }

export default function CertificateOwnershipPanel({ artworkId }) {
  const { t, locale } = useI18n()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [reissue, setReissue] = useState(false)
  const [mode, setMode] = useState('existing')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [collector, setCollector] = useState(null)
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const ERRORS = {
    ownership_conflict: t('La obra ya tiene otro propietario o solicitante. Confirma la sustitución para continuar.', 'The artwork already has another owner or claimant. Confirm the replacement to continue.'),
    active_certificate_exists: t('Ya existe un certificado vigente para otro coleccionista. Usa "Reemitir como nueva versión".', 'A current certificate exists for another collector. Use "Reissue as new version".'),
    artwork_still_for_sale: t('La obra sigue a la venta. Márcala como Vendida o No a la venta antes de asignar propietario.', 'The artwork is still for sale. Mark it Sold or Not for Sale before assigning an owner.'),
    owner_required: t('Selecciona un coleccionista o indica nombre y correo válidos.', 'Select a collector or enter a valid name and email.'),
    confirmation_required: t('Confirma la reemisión.', 'Confirm the reissue.'),
    snapshot_stale: t('La obra cambió mientras se emitía. Vuelve a intentarlo.', 'The artwork changed during issuance. Try again.'),
    artist_profile_name_missing: t('El perfil del artista no tiene nombre.', 'The artist profile has no name.'),
    certificates_migration_missing: t('Falta aplicar la migración de certificados en la base de datos.', 'The certificates migration has not been applied.'),
    signature_missing: t('Falta subir la firma del artista al almacenamiento privado.', 'The artist signature has not been uploaded to private storage.'),
    artwork_image_unavailable: t('No se pudo leer la imagen principal de la obra.', 'The primary artwork image could not be read.'),
    forbidden: t('Solo un Admin autorizado puede realizar esta acción.', 'Only an authorized Admin can perform this action.'),
  }
  const errorText = (code) => ERRORS[code] || t('No fue posible completar la acción.', 'The action could not be completed.')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const res = await fetch(`/api/admin/certificates?artworkId=${encodeURIComponent(artworkId)}`, { headers: await authHeaders(), cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (res.ok) setInfo(json); else setError(errorText(json.error))
    setLoading(false)
  }, [artworkId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/certificates/collectors?q=${encodeURIComponent(query.trim())}`, { headers: await authHeaders() })
      const json = await res.json().catch(() => ({}))
      setResults(res.ok ? json.collectors || [] : [])
    }, 250)
    return () => clearTimeout(timer)
  }, [query, mode])

  const active = info?.certificates?.find((c) => c.status === 'ISSUED') || null
  const art = info?.artwork
  const hasOwnerRisk = Boolean(art?.current_owner || art?.pending_owner || active)
  const fmt = (d) => (d ? new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—')
  const personLabel = (p) => (p ? [p.full_name, p.email].filter(Boolean).join(' · ') || p.id : '—')
  const stateLabel = {
    NOT_CLAIMED: t('No reclamada', 'Not claimed'), CLAIM_PENDING: t('Reclamación pendiente', 'Claim pending'),
    VERIFIED: t('Verificada', 'Verified'), MANUALLY_ASSIGNED: t('Asignada manualmente', 'Manually assigned'),
  }
  const sourceLabel = { DETAIL_CLAIM: t('Reclamación individual', 'Detail claim'), BATCH_CLAIM: t('Reclamación por lote', 'Batch claim'), ADMIN_MANUAL: t('Emisión manual Admin', 'Admin manual'), BACKFILL: t('Migración legacy', 'Legacy backfill') }

  function openIssue(asReissue) {
    setReissue(asReissue); setMode('existing'); setQuery(''); setResults([]); setCollector(null)
    setOwnerName(''); setOwnerEmail(''); setReason(''); setConfirm(false); setError(''); setMessage(''); setOpen(true)
  }

  const needsConfirm = reissue || hasOwnerRisk
  const canSubmit = !busy && (!needsConfirm || confirm) && (mode === 'existing' ? Boolean(collector) : ownerName.trim() && ownerEmail.trim()) && (!reissue || reason.trim())

  async function submit() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/certificates', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          action: 'issue', artworkId, reissue, confirmOverride: confirm, expectedPreviousId: reissue ? active?.id : null, reason,
          ownerId: mode === 'existing' ? collector?.id : null,
          ownerName: mode === 'new' ? ownerName : null, ownerEmail: mode === 'new' ? ownerEmail : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(errorText(json.error)); return }
      setOpen(false)
      setMessage(json.pdfReady
        ? t('Certificado emitido con su PDF oficial.', 'Certificate issued with its official PDF.')
        : `${t('Certificado emitido; el PDF quedó pendiente:', 'Certificate issued; PDF pending:')} ${errorText(json.pdfError)}${json.pdfDetail ? ` (${json.pdfDetail})` : ''}`)
      await load()
    } finally { setBusy(false) }
  }

  async function generatePdf(cert) {
    setBusy(true); setError(''); setMessage('')
    try {
      const res = await fetch('/api/admin/certificates', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'pdf', certificateId: cert.id }) })
      const json = await res.json().catch(() => ({}))
      if (res.ok) { setMessage(t('PDF oficial generado.', 'Official PDF generated.')); await load() } else setError(errorText(json.error))
    } finally { setBusy(false) }
  }

  async function downloadPdf() {
    const res = await fetch(`/api/certificates/download?sku=${encodeURIComponent(art.sku)}`, { headers: await authHeaders() })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.url) window.open(json.url, '_blank', 'noopener'); else setError(errorText(json.error))
  }

  if (loading) return <InlineLoading description={t('Cargando certificado…', 'Loading certificate…')} />
  if (!info) return error ? <InlineNotification lowContrast kind="error" title={error} hideCloseButton /> : null

  return (
    <div className={styles.panel}>
      {error && !open && <InlineNotification lowContrast kind="error" title={error} onCloseButtonClick={() => setError('')} />}
      {message && <InlineNotification lowContrast kind="success" title={message} onCloseButtonClick={() => setMessage('')} />}

      <dl className={styles.grid}>
        <div><dt>{t('Estado', 'Claim state')}</dt><dd><Tag type={STATE_TAG[info.state] || 'gray'} size="sm">{stateLabel[info.state]}</Tag></dd></div>
        <div><dt>{t('Propietario actual', 'Current owner')}</dt><dd>{personLabel(art.current_owner) !== '—' ? personLabel(art.current_owner) : active?.owner_name_snapshot ? `${active.owner_name_snapshot} · ${t('sin cuenta', 'no account')}` : '—'}</dd></div>
        {art.pending_owner && <div><dt>{t('Solicitante pendiente', 'Pending claimant')}</dt><dd>{personLabel(art.pending_owner)}</dd></div>}
        <div><dt>{t('Certificado', 'Certificate')}</dt><dd className={styles.mono}>{active?.certificate_number || '—'}</dd></div>
        <div><dt>{t('Emitido', 'Issued')}</dt><dd>{fmt(active?.issued_at)}</dd></div>
        <div><dt>{t('Origen', 'Source')}</dt><dd>{active ? sourceLabel[active.claim_source] || active.claim_source : '—'}</dd></div>
        <div><dt>{t('Versión', 'Version')}</dt><dd>{active?.version || '—'}</dd></div>
        <div><dt>{t('Integridad', 'Integrity')}</dt><dd>{active ? (active.data_integrity ? t('Datos verificados', 'Data verified') : t('No coincide', 'Mismatch')) : '—'} {active && (active.pdf_hash ? `· PDF ${active.pdf_hash.slice(0, 8)}…` : `· ${t('PDF pendiente', 'PDF pending')}`)}</dd></div>
      </dl>

      <div className={styles.actions}>
        {active?.pdf_hash && <Button kind="tertiary" size="sm" renderIcon={Download} onClick={downloadPdf}>{t('Descargar PDF', 'Download PDF')}</Button>}
        {active && !active.pdf_hash && <Button kind="tertiary" size="sm" renderIcon={Certificate} onClick={() => generatePdf(active)} disabled={busy}>{t('Generar PDF oficial', 'Generate official PDF')}</Button>}
        {art.sku && <Button kind="ghost" size="sm" renderIcon={Launch} href={`/verify/${encodeURIComponent(art.sku)}`} target="_blank" rel="noopener">{t('Abrir verificación', 'Open verify page')}</Button>}
        {!active && <Button kind="primary" size="sm" renderIcon={UserFollow} onClick={() => openIssue(false)}>{t('Emitir / asignar certificado', 'Issue / assign certificate')}</Button>}
        {active && <Button kind="danger--tertiary" size="sm" renderIcon={Renew} onClick={() => openIssue(true)}>{t('Reemitir como nueva versión', 'Reissue as new version')}</Button>}
      </div>

      {info.certificates.length > 1 && (
        <ol className={styles.history}>
          {info.certificates.map((c) => (
            <li key={c.id}><span className={styles.mono}>{c.certificate_number}</span> · v{c.version} · {c.status} · {fmt(c.issued_at)}</li>
          ))}
        </ol>
      )}

      <Modal
        open={open}
        modalHeading={reissue ? t('Reemitir certificado (nueva versión)', 'Reissue certificate (new version)') : t('Emitir / asignar certificado', 'Issue / assign certificate')}
        primaryButtonText={busy ? t('Emitiendo…', 'Issuing…') : t('Emitir certificado', 'Issue certificate')}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        primaryButtonDisabled={!canSubmit}
        onRequestClose={() => !busy && setOpen(false)}
        onRequestSubmit={submit}
        danger={needsConfirm}
      >
        <div className={styles.modalBody}>
          {error && <InlineNotification lowContrast kind="error" title={error} hideCloseButton />}
          {hasOwnerRisk && (
            <InlineNotification lowContrast kind="warning" hideCloseButton
              title={t('Atención: la obra ya tiene propietario, solicitante o certificado vigente.', 'Warning: the artwork already has an owner, claimant or current certificate.')}
              subtitle={t('Continuar reemplaza la titularidad registrada. La versión anterior del certificado se conserva como reemplazada.', 'Continuing replaces the registered ownership. The previous certificate version is kept as superseded.')} />
          )}
          <RadioButtonGroup legendText={t('Coleccionista', 'Collector')} name="collector-mode" valueSelected={mode} onChange={(v) => { setMode(String(v)); setCollector(null) }}>
            <RadioButton id="collector-existing" labelText={t('Con cuenta', 'Existing account')} value="existing" />
            <RadioButton id="collector-new" labelText={t('Sin cuenta', 'No account yet')} value="new" />
          </RadioButtonGroup>
          {mode === 'existing' ? (
            <div>
              <Search size="md" labelText={t('Buscar por nombre o correo', 'Search by name or email')} placeholder={t('Nombre o correo', 'Name or email')} value={query} onChange={(e) => setQuery(e.target.value)} />
              <ul className={styles.results}>
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={collector?.id === p.id ? styles.resultActive : styles.result} onClick={() => setCollector(p)}>
                      <strong>{p.full_name || t('Sin nombre', 'No name')}</strong><span>{p.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className={styles.fields}>
              <TextInput id="owner-name" labelText={t('Nombre del coleccionista', 'Collector name')} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              <TextInput id="owner-email" type="email" labelText={t('Correo del coleccionista', 'Collector email')} value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} helperText={t('No se crea una cuenta. Podrá vincularse después mediante reemisión.', 'No account is created. It can be linked later through a reissue.')} />
            </div>
          )}
          {reissue && <TextArea id="reissue-reason" labelText={t('Motivo de la corrección', 'Reason for correction')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}
          {needsConfirm && (
            <Checkbox id="confirm-override" labelText={t('Confirmo que validé al coleccionista y autorizo este cambio.', 'I confirm I validated the collector and authorize this change.')} checked={confirm} onChange={(_e, { checked }) => setConfirm(checked)} />
          )}
        </div>
      </Modal>
    </div>
  )
}
