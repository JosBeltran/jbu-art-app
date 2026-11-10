'use client'

/* eslint-disable @next/next/no-img-element -- Public Google avatars and existing artwork thumbnails. */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput } from '@carbon/react'
import { Chat, UserAvatar } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { rememberAuthDestination } from '@/lib/authRedirect'
import { supabase } from '@/lib/supabaseClient'
import { discussionKey, readDiscussionDraft, writeDiscussionDraft } from '@/lib/artworkDiscussion'
import styles from './Discussion.module.css'

export async function requestComments(endpoint, params, body, signal) {
  const response = await fetch(endpoint + (params ? '?' + new URLSearchParams(params) : ''), {
    signal, cache: 'no-store', method: body ? 'POST' : 'GET',
    headers: { ...await authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'comments_unavailable')
  return result
}

export function DiscussionButton({ onClick, children }) {
  return <Button kind="ghost" size="sm" renderIcon={Chat} onClick={onClick}>{children}</Button>
}

export function CommentAvatar({ src }) {
  const [failed, setFailed] = useState(false)
  return src && !failed
    ? <img className={styles.avatar} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <UserAvatar className={styles.avatar} size={32} aria-hidden="true" />
}

export function contextLabel(kind, t) {
  return {
    artwork: t('Sobre la obra', 'About the artwork'), primary: t('Imagen principal', 'Primary image'),
    gallery: t('Imagen de galería', 'Gallery image'), legacy: t('Imagen de galería', 'Gallery image'),
    provenance: t('Imagen de procedencia', 'Provenance image'), event: t('Imagen de archivo', 'Archive image'),
    print: t('Opción de impresión', 'Print option'),
  }[kind]
}

function errorMessage(code, t) {
  return {
    unauthorized: t('Continúa con Google para participar.', 'Continue with Google to participate.'),
    participant_blocked: t('Esta cuenta no puede enviar comentarios.', 'This account cannot submit comments.'),
    invalid_body: t('Revisa la longitud del comentario y elimina las direcciones de correo.', 'Check the comment length and remove email addresses.'),
    invalid_display_name: t('Elige un nombre público válido de hasta 60 caracteres.', 'Choose a valid public name of up to 60 characters.'),
    invalid_reply: t('Esta conversación ya no admite esa respuesta.', 'This discussion can no longer accept that reply.'),
    invalid_context: t('Esta discusión ya no está disponible.', 'This discussion is no longer available.'),
    comment_rate_limited: t('Has alcanzado el límite de participación. Intenta más tarde.', 'You’ve reached the participation limit. Try again later.'),
    invalid_report: t('Ya no es posible reportar este comentario.', 'This comment can no longer be reported.'),
    comments_disabled: t('Los comentarios están desactivados.', 'Comments are disabled.'),
    google: t('No pudimos continuar con Google. Tu borrador se conserva.', 'Google sign-in failed. Your draft is still here.'),
  }[code] || t('No se pudo completar la operación. Intenta de nuevo.', 'The request could not be completed. Try again.')
}

function Comment({ row, user, onReply, allowReplies, onThread, open, t, locale }) {
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('spam')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function report(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await requestComments('/api/artwork-comments', null, { action: 'report', id: row.id, reason })
      setNotice('reported')
      setReporting(false)
    } catch (err) { setNotice(err.message) }
    finally { setBusy(false) }
  }

  return <article className={styles.comment}>
    <div className={styles.author}>
      <CommentAvatar key={row.author_avatar_url || 'neutral'} src={row.author_avatar_url} />
      <div><strong>{row.author_display_name}{row.artist && ' — ' + t('Artista', 'Artist')}</strong>
        <div><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString(locale)}</time></div></div>
      {row.artist_note && <Tag type="purple">{t('Nota del artista', 'Artist’s note')}</Tag>}
      {row.pinned && <Tag type="cool-gray">{t('Fijado', 'Pinned')}</Tag>}
      {row.moderation_status === 'PENDING' && <Tag type="warm-gray">{t('Pendiente · solo tú lo ves', 'Pending · only you can see it')}</Tag>}
    </div>
    <p className={styles.body}>{row.body}</p>
    <div className={styles.actions}>
      {row.moderation_status === 'APPROVED' && <>
        {!row.parent_comment_id && allowReplies && <Button kind="ghost" size="sm" onClick={() => onReply(row)}>{t('Responder', 'Reply')}</Button>}
        {!row.mine && <Button kind="ghost" size="sm" onClick={() => {
          if (!user) setNotice('unauthorized')
          else setReporting(!reporting)
        }}>{t('Reportar', 'Report')}</Button>}
      </>}
      {row.replyCount > 0 && onThread && <Button kind="ghost" size="sm" aria-expanded={open} onClick={onThread}>
        {open ? t('Ocultar respuestas', 'Hide replies') : t('Ver respuestas', 'View replies')} ({row.replyCount})
      </Button>}
    </div>
    {notice && <p role="status">{notice === 'reported' ? t('Gracias. El estudio revisará el reporte.', 'Thanks. The studio will review your report.') : errorMessage(notice, t)}</p>}
    {reporting && <form className={styles.actions} onSubmit={report}>
      <Select id={'report-' + row.id} labelText={t('Motivo del reporte', 'Report reason')} value={reason} onChange={e => setReason(e.target.value)}>
        <SelectItem value="spam" text="Spam" /><SelectItem value="abuse" text={t('Abuso', 'Abuse')} />
        <SelectItem value="other" text={t('Otro', 'Other')} />
      </Select>
      <Button size="sm" type="submit" disabled={busy}>{t('Enviar reporte', 'Submit report')}</Button>
      <Button size="sm" kind="ghost" onClick={() => setReporting(false)}>{t('Cancelar', 'Cancel')}</Button>
    </form>}
  </article>
}

function DiscussionList({ artworkId, scope, thread, user, allowReplies, epoch, onReply, activeThread, setActiveThread }) {
  const { t, locale } = useI18n()
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    requestComments('/api/artwork-comments', { artwork: artworkId, context: scope, page, ...(thread ? { thread } : {}) }, null, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setError('') } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [artworkId, scope, thread, page, epoch, user?.id])

  if (error) return <p role="status">{errorMessage(error, t)}</p>
  if (!data) return <InlineLoading description={t('Cargando comentarios…', 'Loading comments…')} />
  return <div className={thread ? styles.replies : styles.list}>
    {!data.comments.length && <p>{t('Todavía no hay comentarios en esta discusión.', 'There are no comments in this discussion yet.')}</p>}
    {data.comments.map(row => <div key={row.id}>
      <Comment row={row} t={t} locale={locale} user={user} onReply={onReply} allowReplies={allowReplies}
        open={activeThread === row.id} onThread={thread ? undefined : () => setActiveThread(activeThread === row.id ? null : row.id)} />
      {!thread && activeThread === row.id && <DiscussionList artworkId={artworkId} scope={scope} thread={row.id} user={user} epoch={epoch} />}
    </div>)}
    <div className={styles.actions}>
      {page > 1 && <Button kind="ghost" size="sm" onClick={() => setPage(page - 1)}>{t('Anterior', 'Previous')}</Button>}
      {data.hasMore && <Button kind="ghost" size="sm" onClick={() => setPage(page + 1)}>{t('Siguiente', 'Next')}</Button>}
    </div>
  </div>
}

export default function ArtworkDiscussion({ artworkId, context, target, user, onEnabled, onGeneral }) {
  const { t } = useI18n()
  const scope = discussionKey(context)
  const formId = useId()
  const editor = useRef(null)
  const inFlight = useRef(false)
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(() => typeof window === 'undefined' ? { body: '', name: '', reply: null, useName: false } :
    readDiscussionDraft(window.sessionStorage, artworkId, context))
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [activeThread, setActiveThread] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    requestComments('/api/artwork-comments', { artwork: artworkId, context: scope }, null, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setData(result)
        onEnabled(result.enabled)
      }
    }).catch(error => { if (!controller.signal.aborted && scope !== 'artwork') setNotice(error.message) })
    return () => controller.abort()
  }, [artworkId, scope, user?.id, onEnabled])

  const enabled = data?.enabled
  useEffect(() => {
    if (enabled && window.location.hash === '#discussion')
      document.getElementById('discussion')?.scrollIntoView({ block: 'start' })
  }, [enabled])

  function updateDraft(change) {
    const next = { ...draft, ...change }
    setDraft(next)
    writeDiscussionDraft(window.sessionStorage, artworkId, context, next)
  }

  async function google() {
    const next = new URL(window.location.href)
    next.searchParams.set('discussion', scope)
    next.hash = 'discussion'
    const destination = next.pathname + next.search + next.hash
    rememberAuthDestination(destination)
    writeDiscussionDraft(window.sessionStorage, artworkId, context, draft)
    const callback = new URL('/auth/callback', next.origin)
    callback.searchParams.set('next', destination)
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: callback.toString(), scopes: 'openid email profile' },
      })
      if (error) throw error
    } catch { setNotice('google'); setBusy(false) }
  }

  async function submit(event) {
    event.preventDefault()
    if (!user || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await requestComments('/api/artwork-comments', null, {
        action: 'submit', artwork: artworkId, context: scope, body: draft.body, parent: draft.reply?.id,
        ...(data.allowDisplayName && draft.useName ? { name: draft.name } : {}),
      })
      setActiveThread(draft.reply?.id || null)
      setDraft({ body: '', name: '', reply: null, useName: false })
      writeDiscussionDraft(window.sessionStorage, artworkId, context, null)
      setNotice(result.status)
      setEpoch(value => value + 1)
    } catch (err) { setNotice(err.message) }
    finally { inFlight.current = false; setBusy(false) }
  }

  if (!data?.enabled && !notice) return null
  return <section id="discussion" className={styles.discussion} aria-labelledby={formId + '-title'}>
    <header className={styles.context}>
      {target?.image && <img src={target.image} alt="" loading="lazy" />}
      <div><h2 id={formId + '-title'}>{t('Comentarios', 'Discussion')}</h2>
        <p>{contextLabel(context.kind, t)}{target?.label && ' · ' + target.label}</p>
        {scope !== 'artwork' && <Button kind="ghost" size="sm" onClick={onGeneral}>{t('Volver a la discusión de la obra', 'Back to artwork discussion')}</Button>}
      </div>
    </header>
    {notice && <InlineNotification lowContrast kind={['APPROVED', 'PENDING'].includes(notice) ? 'success' : 'error'}
      title={notice === 'APPROVED' ? t('Comentario publicado', 'Comment published') :
        notice === 'PENDING' ? t('Comentario enviado para revisión', 'Comment submitted for review') : errorMessage(notice, t)}
      onClose={() => setNotice('')} />}
    {data?.enabled && <>
      <form className={styles.editor} onSubmit={submit} ref={editor}>
        {draft.reply && <div className={styles.actions}>
          <Tag type="purple">{t('Respuesta a', 'Reply to')} {draft.reply.name}</Tag>
          <Button kind="ghost" size="sm" onClick={() => updateDraft({ reply: null })}>{t('Cancelar respuesta', 'Cancel reply')}</Button>
        </div>}
        <TextArea id={formId + '-body'} labelText={t('Comparte tu pregunta o comentario', 'Share a question or comment')}
          value={draft.body} rows={3} maxLength={data.maxLength} onChange={e => updateDraft({ body: e.target.value })} />
        {data.allowDisplayName && <Checkbox id={formId + '-custom'} checked={draft.useName}
          labelText={t('Elegir mi nombre público', 'Choose my public display name')}
          onChange={(_e, { checked }) => updateDraft({ useName: checked, name: data.displayName || draft.name })} />}
        {data.allowDisplayName && draft.useName && <TextInput id={formId + '-name'} maxLength={60}
          labelText={t('Nombre público (vacío para usar tu nombre de Google)', 'Public display name (leave blank to use your Google name)')}
          value={draft.name} onChange={e => updateDraft({ name: e.target.value })} />}
        <p className={styles.hint}>{t('Tu comentario aprobado, nombre público y foto de Google pueden verse en esta obra. Tu correo es privado.', 'Your approved comment, public name and Google photo may appear on this artwork. Your email is private.')} <a href="/privacy">{t('Privacidad', 'Privacy')}</a></p>
        <div className={styles.actions}>{user ?
          <Button type="submit" size="sm" disabled={busy || !draft.body.trim() || draft.body.length > data.maxLength}>{t('Enviar comentario', 'Submit comment')}</Button> :
          <Button type="button" size="sm" disabled={busy} onClick={() => void google()}>{t('Continuar con Google', 'Continue with Google')}</Button>}
          {!user && <span className={styles.hint}>{t('Podrás revisar tu borrador al regresar.', 'You can review your draft when you return.')}</span>}
        </div>
      </form>
      <DiscussionList artworkId={artworkId} scope={scope} user={user} epoch={epoch} allowReplies={data.allowReplies}
        activeThread={activeThread} setActiveThread={setActiveThread} onReply={row => {
          updateDraft({ reply: { id: row.id, name: row.author_display_name } })
          editor.current?.querySelector('textarea')?.focus()
        }} />
    </>}
  </section>
}
