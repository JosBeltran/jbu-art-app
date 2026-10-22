'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Accordion, AccordionItem, Button, InlineLoading, InlineNotification, RadioButton, RadioButtonGroup, Tag } from '@carbon/react'
import { ArrowLeft } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import CollectionView from '@/components/collection/CollectionView'
import styles from './Preview.module.css'
export default function PreviewClient({ profileId }) {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('data')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/admin/collectors/${encodeURIComponent(profileId)}/preview`, { headers: await authHeaders(), cache: 'no-store', signal: controller.signal })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'preview_unavailable')
        setData(result)
      } catch (e) { if (!controller.signal.aborted) setError(e.message) }
    }
    load()
    return () => controller.abort()
  }, [profileId])
  return <div>
    <div className={styles.bar} role="region" aria-label="ADMIN PREVIEW">
      <div className={styles.identity}><strong>ADMIN PREVIEW — {t('Ver colección como', 'Viewing collection as')} {data?.collector.full_name || t('collector seleccionado', 'selected collector')}</strong>{data?.collector.email && <p>{data.collector.email}</p>}<Tag type="warm-gray">{t('Solo lectura', 'Read only')}</Tag></div>
      <Button as={Link} href="/admin/users" kind="tertiary" size="sm" renderIcon={ArrowLeft}>{t('Salir del preview', 'Exit preview')}</Button>
    </div>
    {error ? <InlineNotification kind="error" hideCloseButton title={t('Preview no disponible', 'Preview unavailable')} subtitle={error === 'separate_roles_unavailable' ? t('No se pudo validar el rol Admin en la tabla de roles separados. Acceso denegado.', 'Admin could not be verified through separate roles. Access denied.') : error} /> : !data ? <InlineLoading description={t('Cargando colección...', 'Loading collection...')} /> : <div className={styles.body}>
      <RadioButtonGroup legendText={t('Vista', 'Preview')} name="preview-mode" valueSelected={mode} onChange={value => setMode(String(value))}>
        <RadioButton id="data-preview" value="data" labelText="Data Preview" />
        <RadioButton id="permission-preview" value="permission" labelText="Permission Preview" />
      </RadioButtonGroup>
      {mode === 'data' ? <CollectionView previewData={data} /> : <InlineNotification kind="warning" hideCloseButton title={t('Permisos no verificados', 'Permissions not verified')} subtitle={t('No se ha consultado con los permisos del collector. Data Preview omite RLS. La auditoría de solo lectura debe ejecutarse en la base de datos; nunca se crea una sesión o token del usuario.', 'Collector permissions have not been exercised. Data Preview bypasses RLS. Run the read-only database audit; no user session or token is created.')} />}
      <Accordion className={styles.diagnostics}><AccordionItem title={t('Diagnóstico técnico Admin', 'Admin technical diagnostics')}><div className={styles.details}>
        <p>Profile ID: {data.diagnostics.profileId}</p><p>Auth user ID: {data.diagnostics.authUserId || t('No verificado', 'Unverified')}</p>
        <p>{t('Roles', 'Roles')}: {data.diagnostics.roles.join(', ') || t('No verificados / sin filas', 'Unverified / no rows')}</p>
        <p>{t('Conteos esperados (no confirman acceso)', 'Expected counts (do not confirm access)')}: {Object.entries(data.diagnostics.expected).map(([k,v]) => `${k}: ${v}`).join(' · ')}</p>
        <p>Permission Preview: {data.diagnostics.permission.status}</p>
        {data.diagnostics.warnings.map((w,i) => <p key={`${w.section}-${i}`}>{w.section}: {w.code}</p>)}
      </div></AccordionItem></Accordion>
    </div>}
  </div>
}
