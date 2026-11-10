'use client'

import { useId, useState } from 'react'
import { Button, TextInput } from '@carbon/react'
import { Copy, Share } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { copyShareLink } from '@/lib/copyShareLink'
import { printShareUrl } from '@/lib/social/print'

export default function PrintShare({ variantId, presentation }) {
  const { t } = useI18n()
  const id = useId()
  const [status, setStatus] = useState('')
  const url = printShareUrl(variantId, presentation.language)
  const payload = { title: presentation.title, text: presentation.description, url }

  async function copy() {
    try {
      await copyShareLink(url)
      setStatus('copied')
    } catch {
      setStatus('manual')
    }
  }

  async function share() {
    setStatus('')
    try {
      if (typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare(payload))) {
        await navigator.share(payload)
        return
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
    }
    await copy()
  }

  return <div>
    <Button kind="tertiary" size="sm" renderIcon={Share} onClick={() => void share()}>{t('Compartir', 'Share')}</Button>
    {status === 'copied' && <p role="status">{t('Enlace del print copiado', 'Print link copied')}</p>}
    {status === 'manual' && <div>
      <TextInput id={id} labelText={t('Enlace del print', 'Print link')} value={url} readOnly onFocus={event => event.target.select()} />
      <Button kind="ghost" size="sm" renderIcon={Copy} onClick={() => void copy()}>{t('Copiar enlace', 'Copy link')}</Button>
    </div>}
  </div>
}
