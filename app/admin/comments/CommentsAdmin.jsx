'use client'

/* eslint-disable @next/next/no-img-element -- Existing images identify moderation context. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Checkbox, InlineLoading, InlineNotification, Modal, Search, Select, SelectItem, Tag, TextArea, Tile } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { CommentAvatar, contextLabel, requestComments } from '@/components/comments/ArtworkDiscussion'
import { discussionKey } from '@/lib/artworkDiscussion'
import CommentSettings from './CommentSettings'

const request = (params, body, signal) => requestComments('/api/admin/comments', params, body, signal)
const filters = ['PENDING','APPROVED','REJECTED','HIDDEN','REPORTED','DELETED','ALL']
const states = ['REVIEW_REQUIRED','RESTRICTED','BLOCKED','TRUSTED','AUTO','ALL']

function label(status, t) {
  return {
    PENDING: t('Pendientes', 'Pending'), APPROVED: t('Aprobados', 'Approved'), REJECTED: t('Rechazados', 'Rejected'),
    HIDDEN: t('Ocultos', 'Hidden'), REPORTED: t('Reportados', 'Reported'), DELETED: t('Eliminados', 'Deleted'),
    REVIEW_REQUIRED: t('Revisión obligatoria', 'Review required'), RESTRICTED: t('Restringidos', 'Restricted'),
    BLOCKED: t('Bloqueados', 'Blocked'), TRUSTED: t('Confianza explícita', 'Explicit trust'),
    AUTO: t('Confianza por aprobaciones', 'Approval-based trust'), ALL: t('Todos', 'All'),
  }[status] || status
}

function ParticipantActions({ id, mutate, busy, history, t }) {
  return <div className="flex flex-wrap gap-2">
    {[['TRUSTED', 'Dar confianza', 'Grant trust'], ['REVIEW_REQUIRED', 'Exigir revisión', 'Require review'],
      ['RESTRICTED', 'Restringir', 'Restrict'], ['BLOCKED', 'Bloquear', 'Block'], ['AUTO', 'Restaurar', 'Restore']].map(([state, es, en]) =>
      <Button key={state} size="sm" kind="ghost" disabled={busy} onClick={() => mutate({ action: 'participant', user: id, state })}>{t(es, en)}</Button>)}
    <Button size="sm" kind="ghost" disabled={busy} onClick={() => history({ participant: id })}>{t('Historial del participante', 'Participant history')}</Button>
  </div>
}

export default function CommentsAdmin({ initialComment }) {
  const { t, locale } = useI18n()
  const [view, setView] = useState('comments')
  const [status, setStatus] = useState('PENDING')
  const [state, setState] = useState('ALL')
  const [comment, setComment] = useState(initialComment)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [selected, setSelected] = useState([])
  const [confirmation, setConfirmation] = useState(null)
  const [reason, setReason] = useState('')
  const [reply, setReply] = useState(null)
  const [history, setHistory] = useState(null)
  const [epoch, refresh] = useState(0)

  useEffect(() => {
    if (view === 'settings') return
    const controller = new AbortController()
    request(view === 'participants' ? { view, state, page, q: query } : { status, q: query, page, ...(comment ? { comment } : {}) }, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(() => { if (!controller.signal.aborted) { setNotice({ error: true }); setData({}) } })
    return () => controller.abort()
  }, [view, state, page, status, query, comment, epoch])

  function reset() {
    setSelected([])
    setComment('')
    setPage(1)
    setData(null)
  }

  async function mutate(body) {
    if (busy) return false
    setBusy(true)
    setNotice(null)
    try {
      const result = await request(null, body)
      setNotice({ unchanged: result.changed === 0 })
      setSelected([])
      setConfirmation(null)
      setReply(null)
      refresh(value => value + 1)
      window.dispatchEvent(new Event('jbu:comments-moderated'))
      return true
    } catch (error) { setNotice({ error: true, code: error.message }); return false }
    finally { setBusy(false) }
  }

  async function openHistory(params) {
    try { setHistory((await request({ view: 'history', ...params })).history) }
    catch { setNotice({ error: true }) }
  }

  const review = (action, ids) => {
    setReason('')
    setConfirmation({ action, ids })
  }
  const studioReply = (row, note = false) => {
    const scope = discussionKey({ kind: row.context_kind, ref: row.context_ref })
    setReply({ action: 'studio', artwork: row.artwork_id, context: scope, parent: note ? null : row.parent_comment_id || row.id,
      body: '', note })
  }
  return <section className="mx-auto grid max-w-5xl gap-4 p-4">
    <h1>{t('Comentarios de las obras', 'Artwork discussions')}</h1>
    <div className="flex flex-wrap gap-2">
      {[['comments','Comentarios','Comments'],['participants','Participantes','Participants'],['settings','Configuración','Settings']].map(([key, es, en]) =>
        <Button key={key} size="sm" kind={view === key ? 'primary' : 'secondary'} aria-pressed={view === key}
          onClick={() => { if (view !== key) { reset(); setView(key) } }}>{t(es, en)}</Button>)}
    </div>
    {notice && <InlineNotification lowContrast kind={notice.error ? 'error' : 'success'}
      title={notice.error ? ({
        forbidden: t('La acción no está autorizada para esta cuenta.', 'This account cannot perform the action.'),
        invalid_reply: t('La conversación ya no permite esa respuesta.', 'This discussion no longer accepts that reply.'),
        invalid_body: t('Revisa la longitud y elimina direcciones de correo.', 'Check the length and remove email addresses.'),
        links_disabled: t('Habilita los enlaces en la configuración para aprobar este comentario.', 'Enable links in settings before approving this comment.'),
      }[notice.code] || t('No se pudo completar la operación.', 'Could not complete the operation.')) :
        notice.unchanged ? t('La selección ya estaba actualizada.', 'The selection was already up to date.') : t('Cambios guardados', 'Changes saved')}
      onClose={() => setNotice(null)} />}
    {view === 'settings' && <CommentSettings request={request} mutate={mutate} busy={busy} />}
    {view === 'comments' && <>
      <form className="grid gap-2" onSubmit={e => { e.preventDefault(); if (query !== search.trim() || comment || page !== 1) { reset(); setQuery(search.trim()) } }}>
        <Search id="admin-comment-search" labelText={t('Buscar comentarios', 'Search comments')}
          placeholder={t('Busca por obra, SKU, autor o texto', 'Search artwork, SKU, author or text')} value={search} onChange={e => setSearch(e.target.value)} />
        <div><Button kind="secondary" type="submit" size="sm">{t('Buscar', 'Search')}</Button></div>
      </form>
      <Select id="admin-comment-status" labelText={t('Estado', 'Status')} value={status}
        onChange={e => { reset(); setStatus(e.target.value) }}>
        {filters.map(key => <SelectItem key={key} value={key} text={label(key, t)} />)}
      </Select>
      {comment && <div><Button kind="ghost" size="sm" onClick={reset}>{t('Volver a la cola', 'Back to queue')}</Button></div>}
      {selected.length > 0 && <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => review('approve', selected)}>{t('Aprobar selección', 'Approve selection')} ({selected.length})</Button>
        <Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => review('reject', selected)}>{t('Rechazar selección', 'Reject selection')}</Button>
      </div>}
    </>}
    {view === 'participants' && <form className="grid gap-2" onSubmit={event => {
      event.preventDefault()
      if (query !== search.trim() || page !== 1) { reset(); setQuery(search.trim()) }
    }}>
      <Search id="admin-comment-participant-search" labelText={t('Buscar participante', 'Search participants')}
        value={search} onChange={event => setSearch(event.target.value)} />
      <div><Button kind="secondary" type="submit" size="sm">{t('Buscar', 'Search')}</Button></div>
    </form>}
    {view === 'participants' && <Select id="admin-comment-participant-state" labelText={t('Estado del participante', 'Participant status')} value={state}
      onChange={e => { reset(); setState(e.target.value) }}>
      {states.map(key => <SelectItem key={key} value={key} text={label(key, t)} />)}
    </Select>}
    {view !== 'settings' && !data && <InlineLoading />}
    {view === 'participants' && data?.participants?.map(row => <Tile key={row.user_id} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2"><CommentAvatar src={row.avatar} />
        <strong>{row.public_display_name || row.author_name || t('Participante', 'Participant')} · {row.user_id.slice(0, 8)}</strong>
        <Tag type="cool-gray">{label(row.state, t)}</Tag>
      </div>
      <ParticipantActions id={row.user_id} mutate={mutate} busy={busy} history={openHistory} t={t} />
    </Tile>)}
    {view === 'comments' && data?.comments?.map(row => {
      const scope = discussionKey({ kind: row.context_kind, ref: row.context_ref })
      const params = new URLSearchParams({ discussion: scope, ...(row.context_kind === 'print' ? { print: row.context_ref } : {}) })
      const reports = row.reports || []
      const activeReports = reports.filter(report => !report.reviewed_at)
      return <Tile key={row.id} className="grid gap-2 break-words">
        <div className="flex flex-wrap items-center gap-2">
          {row.moderation_status === 'PENDING' && <Checkbox id={'select-' + row.id} checked={selected.includes(row.id)}
            labelText={t('Seleccionar', 'Select')} onChange={(_e, { checked }) =>
              setSelected(old => checked ? [...old, row.id] : old.filter(id => id !== row.id))} />}
          <CommentAvatar src={row.author_avatar_url} /><strong>{row.author_display_name}</strong>
          <Tag type={row.moderation_status === 'APPROVED' ? 'green' : 'cool-gray'}>{label(row.moderation_status, t)}</Tag>
          {activeReports.length > 0 && <Tag type="red">{activeReports.length} {t('reportes abiertos', 'open reports')}</Tag>}
          {row.participant_state && <Tag type="purple">{label(row.participant_state, t)}</Tag>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.context_image && <img src={row.context_image} alt="" loading="lazy" className="h-16 w-16 object-contain" />}
          <div><Link href={'/artwork/' + encodeURIComponent(row.sku) + '?' + params + '#discussion'}>{row.artwork_title} · {row.sku}</Link>
            <p>{contextLabel(row.context_kind, t)} {row.print_size && '· ' + row.print_size}</p></div>
        </div>
        <p className="whitespace-pre-wrap break-all">{row.body || '—'}</p>
        <p>{new Date(row.created_at).toLocaleString(locale)}{row.moderation_reason && ' · ' + row.moderation_reason}</p>
        {reports.map((report, index) => <p key={index}>{t('Reporte', 'Report')} · {report.reason} · {
          report.reviewed_at ? t('Revisado', 'Reviewed') : t('Pendiente', 'Pending')}</p>)}
        <div className="flex flex-wrap gap-2">
          {!['APPROVED','DELETED'].includes(row.moderation_status) &&
            <Button size="sm" disabled={busy} onClick={() => review('approve', [row.id])}>{t('Aprobar', 'Approve')}</Button>}
          {!['REJECTED','DELETED'].includes(row.moderation_status) &&
            <Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => review('reject', [row.id])}>{t('Rechazar', 'Reject')}</Button>}
          {row.moderation_status === 'APPROVED' &&
            <Button kind="ghost" size="sm" disabled={busy} onClick={() => review('hide', [row.id])}>{t('Ocultar', 'Hide')}</Button>}
          {row.moderation_status !== 'DELETED' &&
            <Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => review('delete', [row.id])}>{t('Eliminar', 'Delete')}</Button>}
          {row.moderation_status === 'APPROVED' &&
            <Button kind="secondary" size="sm" disabled={busy} onClick={() => studioReply(row)}>{t('Responder como JBU Studio', 'Reply as JBU Studio')}</Button>}
          {row.moderation_status !== 'DELETED' &&
            <Button kind="ghost" size="sm" disabled={busy} onClick={() => studioReply(row, true)}>{t('Añadir nota del artista', 'Add artist’s note')}</Button>}
          {row.artist && row.moderation_status === 'APPROVED' && !row.parent_comment_id &&
            <Button kind="ghost" size="sm" disabled={busy} onClick={() => void mutate({ action: row.pinned ? 'unpin' : 'pin', ids: [row.id] })}>
              {row.pinned ? t('Desfijar', 'Unpin') : t('Fijar', 'Pin')}</Button>}
          {activeReports.length > 0 &&
            <Button kind="ghost" size="sm" disabled={busy} onClick={() => review('review_reports', [row.id])}>{t('Marcar reportes revisados', 'Mark reports reviewed')}</Button>}
          <Button kind="ghost" size="sm" disabled={busy} onClick={() => openHistory({ id: row.id })}>{t('Historial', 'History')}</Button>
        </div>
        {!row.artist && row.author_user_id && <ParticipantActions id={row.author_user_id} mutate={mutate} busy={busy} history={openHistory} t={t} />}
      </Tile>
    })}
    {data && view !== 'settings' && !(data.comments || data.participants)?.length && <p>{t('No se encontraron resultados.', 'No results found.')}</p>}
    {view !== 'settings' && <div className="flex flex-wrap gap-2">
      {page > 1 && <Button size="sm" kind="ghost" onClick={() => { setSelected([]); setPage(page - 1) }}>{t('Anterior', 'Previous')}</Button>}
      {data?.hasMore && <Button size="sm" kind="ghost" onClick={() => { setSelected([]); setPage(page + 1) }}>{t('Siguiente', 'Next')}</Button>}
    </div>}
    {confirmation && <Modal open modalHeading={t('Confirmar moderación', 'Confirm moderation')}
      primaryButtonText={t('Confirmar', 'Confirm')} secondaryButtonText={t('Cancelar', 'Cancel')}
      danger={['delete','reject'].includes(confirmation.action)} primaryButtonDisabled={busy}
      onRequestClose={() => setConfirmation(null)} onRequestSubmit={() => void mutate({ ...confirmation, reason })}>
      <p>{confirmation.action === 'delete' ? t('Se borrarán el texto y los datos públicos del autor de este comentario.',
        'This comment’s text and public author details will be removed.') : t('Comentarios seleccionados', 'Selected comments') + ' · ' + confirmation.ids.length}</p>
      <TextArea id="moderation-reason" labelText={t('Motivo interno (opcional)', 'Internal reason (optional)')}
        value={reason} maxLength={400} onChange={e => setReason(e.target.value)} />
    </Modal>}
    {reply && <Modal open modalHeading={reply.note ? t('Nota del artista', 'Artist’s note') : t('Responder como JBU Studio', 'Reply as JBU Studio')}
      primaryButtonText={t('Publicar', 'Publish')} secondaryButtonText={t('Cancelar', 'Cancel')}
      primaryButtonDisabled={busy || !reply.body.trim()} onRequestClose={() => setReply(null)} onRequestSubmit={() => void mutate(reply)}>
      <TextArea id="studio-comment-body" labelText={t('Mensaje público', 'Public message')} value={reply.body} rows={5} maxLength={4000}
        onChange={e => setReply({ ...reply, body: e.target.value })} />
    </Modal>}
    {history && <Modal open passiveModal modalHeading={t('Historial de moderación', 'Moderation history')} onRequestClose={() => setHistory(null)}>
      {history.length ? <ul>{history.map((event, index) => <li key={index}>
        {new Date(event.created_at).toLocaleString(locale)} · {event.action} {event.details?.state || event.details?.reason || ''}
      </li>)}</ul> : <p>{t('Sin acciones registradas.', 'No actions recorded.')}</p>}
    </Modal>}
  </section>
}
