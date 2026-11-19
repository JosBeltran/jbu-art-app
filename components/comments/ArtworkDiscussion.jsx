'use client'

/* eslint-disable @next/next/no-img-element -- Public Google avatars and existing artwork thumbnails. */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput } from '@carbon/react'
import { Chat, UserAvatar } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { rememberAuthDestination } from '@/lib/authRedirect'
import { supabase } from '@/lib/supabaseClient'
import { discussionKey, parseDiscussion, readDiscussionDraft, writeDiscussionDraft } from '@/lib/artworkDiscussion'
import styles from './Discussion.module.css'

function browserStorage() {
  try { return window.sessionStorage } catch { return null }
}

export async function requestComments(endpoint, params, body, signal) {
  const response = await fetch(endpoint + (params ? '?' + new URLSearchParams(params) : ''), {
    signal, cache: 'no-store', method: body ? 'POST' : 'GET',
    headers: { ...await authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || (endpoint === '/api/artwork-comments' && params && !Array.isArray(result.comments))) throw new Error(result.error || 'comments_unavailable')
  return result
}

export function DiscussionButton({ onClick, children }) {
  return <Button kind="ghost" size="sm" renderIcon={Chat} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onClick(event) }}>{children}</Button>
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

function DiscussionList({ data, error, retry, page, setPage, artworkId, scope, thread, user, allowReplies, epoch, onReply, activeThread, setActiveThread }) {
  const { t, locale } = useI18n()
  if (error) return <div><p role="status">{errorMessage(error, t)}</p>
    <Button kind="ghost" size="sm" onClick={retry}>{t('Reintentar', 'Retry')}</Button></div>
  if (!data) return <InlineLoading description={t('Cargando comentarios…', 'Loading comments…')} />
  return <div className={thread ? styles.replies : styles.list}>
    {!data.comments.length && <div className={styles.empty}>
      <p>{['artwork', 'print'].includes(scope.split(':')[0]) ? t('Todavía no hay comentarios en esta discusión.', 'There are no comments in this discussion yet.') :
        t('Todavía no hay comentarios sobre esta imagen.', 'No comments on this image yet.')}</p>
      <p>{t('Sé el primero en compartir tu impresión.', 'Be the first to share your thoughts.')}</p>
    </div>}
    {data.comments.map(row => <div key={row.id}>
      <Comment row={row} t={t} locale={locale} user={user} onReply={onReply} allowReplies={allowReplies}
        open={activeThread === row.id} onThread={thread ? undefined : () => setActiveThread(activeThread === row.id ? null : row.id)} />
      {!thread && activeThread === row.id && <Replies artworkId={artworkId} scope={scope} thread={row.id} user={user} epoch={epoch} />}
    </div>)}
    <div className={styles.actions}>
      {page > 1 && <Button kind="ghost" size="sm" onClick={() => setPage(page - 1)}>{t('Anterior', 'Previous')}</Button>}
      {data.hasMore && <Button kind="ghost" size="sm" onClick={() => setPage(page + 1)}>{t('Siguiente', 'Next')}</Button>}
    </div>
  </div>
}

function useDiscussion(artworkId, scope, userId, thread, epoch) {
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const key = JSON.stringify([artworkId, scope, userId, thread, epoch, page, attempt])
  useEffect(() => {
    const controller = new AbortController()
    const deadline = setTimeout(() => {
      controller.abort()
      setResult({ key, error: 'comments_unavailable' })
    }, 8000)
    requestComments('/api/artwork-comments', { artwork: artworkId, context: scope, page, ...(thread ? { thread } : {}) }, null, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }) })
      .finally(() => clearTimeout(deadline))
    return () => { clearTimeout(deadline); controller.abort() }
  }, [key, artworkId, scope, thread, page])
  return { ...(result?.key === key ? result : {}), page, setPage, retry: () => setAttempt(value => value + 1) }
}

function Replies({ artworkId, scope, thread, user, epoch }) {
  const request = useDiscussion(artworkId, scope, user?.id, thread, epoch)
  return <DiscussionList {...request} artworkId={artworkId} scope={scope} thread={thread} user={user} />
}

const pendingSubmissions = new Map()

export default function ArtworkDiscussion({ artworkId, context, user, photo }) {
  const { t } = useI18n()
  const scope = discussionKey(context)
  const formId = useId()
  const editor = useRef(null)
  const [draft, setDraft] = useState(() => readDiscussionDraft(browserStorage(), artworkId, context))
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [activeThread, setActiveThread] = useState(null)
  const request = useDiscussion(artworkId, scope, user?.id, null, epoch)
  const { data } = request
  const submissionKey = user?.id + ':' + artworkId + ':' + scope
  const [existingSubmission] = useState(() => pendingSubmissions.get(submissionKey))

  useEffect(() => {
    if (!existingSubmission) return
    let active = true
    existingSubmission.then(result => {
      if (!active) return
      setNotice(result.notice)
      if (result.saved) {
        setDraft(readDiscussionDraft(browserStorage(), artworkId, parseDiscussion(scope)))
        setEpoch(value => value + 1)
      }
    })
    return () => { active = false }
  }, [existingSubmission, artworkId, scope])


  function updateDraft(change) {
    const next = { ...draft, ...change }
    setDraft(next)
    writeDiscussionDraft(browserStorage(), artworkId, context, next)
  }

  async function google() {
    const next = new URL(window.location.href)
    next.searchParams.set('discussion', scope)
    if (context.kind === 'print') {
      next.searchParams.set('variant', context.ref)
      if (photo) next.searchParams.set('photo', photo)
    }
    next.hash = 'discussion'
    const destination = next.pathname + next.search + next.hash
    rememberAuthDestination(destination)
    writeDiscussionDraft(browserStorage(), artworkId, context, draft)
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
    if (!user || pendingSubmissions.has(submissionKey)) return
    setBusy(true)
    const operation = requestComments('/api/artwork-comments', null, {
      action: 'submit', artwork: artworkId, context: scope, body: draft.body, parent: draft.reply?.id,
      ...(data.allowDisplayName && draft.useName ? { name: draft.name } : {}),
    }).then(result => {
      writeDiscussionDraft(browserStorage(), artworkId, context, null)
      return { saved: true, notice: result.status }
    }).catch(error => ({ saved: false, notice: error.message }))
      .finally(() => pendingSubmissions.delete(submissionKey))
    pendingSubmissions.set(submissionKey, operation)
    const result = await operation
    setNotice(result.notice)
    if (result.saved) {
      setActiveThread(draft.reply?.id || null)
      setDraft(readDiscussionDraft(browserStorage(), artworkId, context))
      setEpoch(value => value + 1)
    }
    setBusy(false)
  }

  if (data && !data.enabled) return <p role="status">{errorMessage('comments_disabled', t)}</p>
  return <div className={styles.discussion}>
    <div className={styles.stream} tabIndex={0} aria-label={t('Lista de comentarios', 'Comment list')}>
      <DiscussionList {...request} artworkId={artworkId} scope={scope} user={user} epoch={epoch}
        allowReplies={data?.allowReplies} activeThread={activeThread} setActiveThread={setActiveThread}
        onReply={row => {
          updateDraft({ reply: { id: row.id, name: row.author_display_name } })
          editor.current?.querySelector('textarea')?.focus()
        }} />
    </div>
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
          value={draft.body} disabled={busy || Boolean(existingSubmission && pendingSubmissions.has(submissionKey))} rows={2} maxLength={data.maxLength} onChange={e => updateDraft({ body: e.target.value })} />
        {data.allowDisplayName && <Checkbox id={formId + '-custom'} checked={draft.useName}
          labelText={t('Elegir mi nombre público', 'Choose my public display name')}
          onChange={(_e, { checked }) => updateDraft({ useName: checked, name: data.displayName || draft.name })} />}
        {data.allowDisplayName && draft.useName && <TextInput id={formId + '-name'} maxLength={60}
          labelText={t('Nombre público (vacío para usar tu nombre de Google)', 'Public display name (leave blank to use your Google name)')}
          value={draft.name} onChange={e => updateDraft({ name: e.target.value })} />}
        <p className={styles.hint}>{t('Tu comentario aprobado, nombre público y foto de Google pueden verse en esta obra. Tu correo es privado.', 'Your approved comment, public name and Google photo may appear on this artwork. Your email is private.')} <a href="/privacy">{t('Privacidad', 'Privacy')}</a></p>
        <div className={styles.actions}>{user ?
          <Button type="submit" size="sm" disabled={busy || pendingSubmissions.has(submissionKey) || !draft.body.trim() || draft.body.length > data.maxLength}>{t('Enviar comentario', 'Submit comment')}</Button> :
          <Button type="button" size="sm" disabled={busy} onClick={() => void google()}>{t('Continuar con Google', 'Continue with Google')}</Button>}
          {!user && <span className={styles.hint}>{t('Podrás revisar tu borrador al regresar.', 'You can review your draft when you return.')}</span>}
        </div>
      </form>
    </>}
  </div>
}
