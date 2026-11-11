'use client'

import { useEffect, useState } from 'react'
import { Button, Select, SelectItem, TextArea, InlineNotification, InlineLoading, Tag, Checkbox } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

export default function AdminFacebookPage() {
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [artworkId, setArtworkId] = useState('')
  const [page, setPage] = useState('test')
  const [publish, setPublish] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    try {
      const response = await fetch('/api/admin/facebook', { headers: await authHeaders(), cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'facebook_unavailable')
      setData(body)
      setError('')
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { void load() }, [])

  const artwork = data?.artworks?.find(item => item.id === artworkId)
  const artworkUrl = artwork ? `https://josuebeltranuresti.com/artwork/${encodeURIComponent(artwork.sku)}` : ''

  async function send(event) {
    event.preventDefault()
    if (!artworkId || !message.trim() || !confirmed) return
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/admin/facebook', {
        method: 'POST',
        headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworkId, page, message, publish,
          confirmation: publish ? (page === 'main' ? 'PUBLISH_MAIN' : 'PUBLISH_TEST') : null,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error + (body.facebookPostId ? ` · ${body.facebookPostId}` : ''))
      setResult(body.post)
      setConfirmed(false)
      await load()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '1.5rem 0', display: 'grid', gap: '1.5rem' }}>
      <header>
        <p className="cds--label">JBU ART · Meta</p>
        <h1>{t('Publicaciones de Facebook', 'Facebook publishing')}</h1>
        <p style={{ color: 'var(--cds-text-secondary)', marginTop: 8 }}>
          {t('Publica enlaces a tus obras desde la página de Facebook. Empieza con la página de pruebas.', 'Post artwork links from your Facebook Page. Start with the test Page.')}
        </p>
      </header>
      {!data && !error && <InlineLoading description={t('Cargando...', 'Loading...')} />}
      {error && <InlineNotification kind="error" title={t('No se pudo completar', 'Could not complete')} subtitle={error} lowContrast hideCloseButton />}
      {result && <InlineNotification kind="success" title={t('Publicación creada', 'Post created')}
        subtitle={`${result.state} · ${result.facebook_post_id}`} lowContrast hideCloseButton />}
      {data && <form onSubmit={send} style={{ display: 'grid', gap: 20, padding: 20, border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer-01)' }}>
        <Select id="facebook-artwork" labelText={t('Obra', 'Artwork')} value={artworkId} onChange={e => { setArtworkId(e.target.value); setConfirmed(false) }}>
          <SelectItem value="" text={t('Seleccionar obra', 'Select artwork')} />
          {data.artworks.map(a => <SelectItem key={a.id} value={a.id} text={`${a.title} · ${a.sku}`} />)}
        </Select>
        {artwork && <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {artwork.primary_image_url && <img src={artwork.primary_image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover' }} />}
          <div><strong>{lang === 'en' ? artwork.title_en || artwork.title : artwork.title}</strong>
            <p style={{ fontSize: 12, overflowWrap: 'anywhere', color: 'var(--cds-text-secondary)' }}>{artworkUrl}</p>
          </div>
        </div>}
        <Select id="facebook-page" labelText={t('Página de destino', 'Destination Page')} value={page} onChange={e => { setPage(e.target.value); setConfirmed(false) }}>
          <SelectItem value="test" text={t('Página de pruebas', 'Test Page')} disabled={!data.pages.test} />
          <SelectItem value="main" text="josuebeltranuresti.com" disabled={!data.pages.main} />
        </Select>
        <TextArea id="facebook-message" labelText={t('Texto de la publicación', 'Post text')} value={message} maxCount={2000}
          onChange={e => { setMessage(e.target.value); setConfirmed(false) }} rows={5}
          helperText={t('Se añadirá automáticamente el enlace público de la obra.', 'The public artwork link will be attached automatically.')} />
        <Checkbox id="facebook-publish" checked={publish} onChange={checked => { setPublish(Boolean(checked)); setConfirmed(false) }}
          labelText={t('Publicar de inmediato (visible al público)', 'Publish now (publicly visible)')} />
        {page === 'main' && <InlineNotification kind="warning" title={t('Página oficial seleccionada', 'Official Page selected')}
          subtitle={t('Esta acción afecta tu página principal de Facebook.', 'This action affects your main Facebook Page.')} lowContrast hideCloseButton />}
        <Checkbox id="facebook-confirm" checked={confirmed} onChange={checked => setConfirmed(Boolean(checked))}
          labelText={publish ? t('Confirmo que deseo publicar en la página seleccionada.', 'I confirm I want to publish on the selected Page.')
            : t('Confirmo crear una publicación no publicada en esta página.', 'I confirm creating an unpublished post on this Page.')} />
        <Button type="submit" disabled={!artworkId || !message.trim() || !confirmed || busy || !data.pages[page]}>
          {busy ? t('Enviando...', 'Sending...') : publish ? t('Publicar en Facebook', 'Publish to Facebook') : t('Crear publicación no publicada', 'Create unpublished post')}
        </Button>
      </form>}
      {data && <section style={{ display: 'grid', gap: 10 }}>
        <h2>{t('Historial de publicaciones', 'Publication history')}</h2>
        {data.posts.length === 0 && <p>{t('Aún no hay publicaciones registradas.', 'No tracked posts yet.')}</p>}
        {data.posts.map(post => <div key={post.id} style={{ padding: 12, border: '1px solid var(--cds-border-subtle-01)' }}>
          <Tag type={post.state === 'PUBLISHED' ? 'green' : 'cool-gray'}>{post.state}</Tag>
          <p>{data.artworks.find(a => a.id === post.artwork_id)?.title || post.artwork_id}</p>
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: 12 }}>{post.facebook_post_id} · {new Date(post.created_at).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX')}</p>
        </div>)}
      </section>}
    </div>
  )
}
