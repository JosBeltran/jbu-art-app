'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, Select, SelectItem, TextInput, TextArea, Tag, InlineNotification } from '@carbon/react'
import { Add, Edit, TrashCan, Save, Close } from '@carbon/icons-react'
import { authHeaders } from '@/lib/authHeaders'
import { useI18n } from '@/components/I18nProvider'

const TYPES = [
  ['MATERIAL_UPDATE', 'Actualización de material', 'Material update'],
  ['RESTORATION', 'Restauración', 'Restoration'],
  ['FRAMING_UPDATE', 'Enmarcado', 'Framing update'],
  ['EXHIBITION', 'Exposición', 'Exhibition'],
  ['PUBLICATION', 'Publicación', 'Publication'],
  ['MANUAL_PROVENANCE', 'Procedencia manual', 'Manual provenance'],
  ['WITHDRAWN', 'Retirada de venta (interno)', 'Withdrawn (internal)'],
  ['ARCHIVED', 'Archivada (interno)', 'Archived (internal)']
]
const VIS = [['PUBLIC', 'Pública', 'Public'], ['PRIVATE', 'Privada', 'Private'], ['ADMIN_ONLY', 'Solo admin', 'Admin only']]
const empty = { event_type: 'MATERIAL_UPDATE', title: '', description: '', event_date: '', visibility: 'PUBLIC' }

export default function ProvenanceManager({ artworkId }) {
  const { t } = useI18n()
  const [events, setEvents] = useState([])
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState('')

  const api = `/api/admin/artworks/${artworkId}/provenance`
  const load = useCallback(async () => {
    const r = await fetch(api, { headers: await authHeaders() })
    const j = await r.json().catch(() => ({}))
    if (r.ok) setEvents(j.events || []); else setMsg(j.error || 'Error')
  }, [api])
  useEffect(() => { load() }, [load])

  const send = async (method, body, qs = '') => {
    const r = await fetch(api + qs, { method, headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error || 'Error'); return null }
    setMsg(''); await load(); return j
  }

  const addEvent = async () => { if (await send('POST', form)) setForm(null) }
  const confirmSys = (e) => e.source === 'MANUAL' || window.confirm(t('Este registro es del SISTEMA. ¿Confirmas que quieres corregirlo?', 'This is a SYSTEM record. Confirm you want to correct it?'))
  const saveEdit = async () => {
    const e = events.find((x) => x.id === editing.id)
    if (!confirmSys(e)) return
    if (await send('PATCH', { ...editing, confirmSystem: e.source !== 'MANUAL' })) setEditing(null)
  }
  const remove = async (e) => {
    const ok = e.source === 'MANUAL'
      ? window.confirm(t('¿Eliminar este registro manual?', 'Delete this manual record?'))
      : window.confirm(t('Registro del SISTEMA: eliminarlo borra historia real. ¿Confirmas?', 'SYSTEM record: deleting removes real history. Confirm?'))
    if (ok) await send('DELETE', null, `?event=${e.id}${e.source !== 'MANUAL' ? '&confirmSystem=1' : ''}`)
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {msg && <InlineNotification kind="error" lowContrast title={msg} onClose={() => setMsg('')} />}
      {events.length === 0 && <p style={{ opacity: 0.7 }}>{t('Sin registros todavía.', 'No records yet.')}</p>}
      {events.map((e) => (
        <div key={e.id} style={{ borderTop: '1px solid var(--cds-border-subtle)', paddingTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
          {editing?.id === e.id ? (
            <>
              <TextInput id={`t-${e.id}`} labelText={t('Título', 'Title')} value={editing.title} onChange={(ev) => setEditing({ ...editing, title: ev.target.value })} />
              <TextArea id={`d-${e.id}`} labelText={t('Descripción', 'Description')} rows={2} value={editing.description || ''} onChange={(ev) => setEditing({ ...editing, description: ev.target.value })} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button size="sm" renderIcon={Save} onClick={saveEdit}>{t('Guardar', 'Save')}</Button>
                <Button size="sm" kind="ghost" renderIcon={Close} onClick={() => setEditing(null)}>{t('Cancelar', 'Cancel')}</Button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>{e.event_date || new Date(e.created_at).toISOString().slice(0, 10)} · {e.event_type}</p>
                <p style={{ fontWeight: 600 }}>{e.title}</p>
                {e.description && <p style={{ opacity: 0.8 }}>{e.description}</p>}
                <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                  <Tag size="sm" type={e.source === 'SYSTEM' ? 'purple' : e.source === 'LEGACY' ? 'gray' : 'cool-gray'}>{e.source}</Tag>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'flex-start' }}>
                <Select id={`v-${e.id}`} labelText="" hideLabel size="sm" value={e.visibility} onChange={(ev) => send('PATCH', { id: e.id, visibility: ev.target.value })}>
                  {VIS.map(([v, es, en]) => <SelectItem key={v} value={v} text={t(es, en)} />)}
                </Select>
                <Button size="sm" kind="ghost" hasIconOnly iconDescription={t('Editar', 'Edit')} renderIcon={Edit} onClick={() => setEditing({ id: e.id, title: e.title || '', description: e.description || '' })} />
                <Button size="sm" kind="ghost" hasIconOnly iconDescription={t('Eliminar', 'Delete')} renderIcon={TrashCan} onClick={() => remove(e)} />
              </div>
            </div>
          )}
        </div>
      ))}

      {form ? (
        <div style={{ display: 'grid', gap: '0.75rem', borderTop: '1px solid var(--cds-border-subtle)', paddingTop: '0.75rem' }}>
          <Select id="prov-type" labelText={t('Tipo', 'Type')} value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value, visibility: ['WITHDRAWN', 'ARCHIVED'].includes(e.target.value) ? 'ADMIN_ONLY' : form.visibility })}>
            {TYPES.map(([v, es, en]) => <SelectItem key={v} value={v} text={t(es, en)} />)}
          </Select>
          <TextInput id="prov-title" labelText={t('Título', 'Title')} placeholder={t('Ej. Capa final de resina aplicada', 'e.g. Final resin layer applied')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextArea id="prov-desc" labelText={t('Descripción', 'Description')} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextInput id="prov-date" labelText={t('Fecha (AAAA, AAAA-MM o AAAA-MM-DD)', 'Date (YYYY, YYYY-MM or YYYY-MM-DD)')} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          <Select id="prov-vis" labelText={t('Visibilidad', 'Visibility')} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            {VIS.map(([v, es, en]) => <SelectItem key={v} value={v} text={t(es, en)} />)}
          </Select>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button size="sm" renderIcon={Save} onClick={addEvent}>{t('Agregar registro', 'Add record')}</Button>
            <Button size="sm" kind="ghost" onClick={() => setForm(null)}>{t('Cancelar', 'Cancel')}</Button>
          </div>
        </div>
      ) : (
        <div><Button size="sm" kind="tertiary" renderIcon={Add} onClick={() => setForm({ ...empty })}>{t('Agregar evento manual', 'Add manual event')}</Button></div>
      )}
    </div>
  )
}
