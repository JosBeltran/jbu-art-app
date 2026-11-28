'use client'

import {useState} from 'react'
import dynamic from 'next/dynamic'
import {Button,InlineLoading} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'

function Loading() {
  const {t}=useI18n()
  return <InlineLoading description={t('Cargando visualización…','Loading visualization…')} />
}

const WallSpace=dynamic(()=>import('./WallSpace'),{ssr:false,loading:Loading})

/** @param {{initial: any, variants?: any[], roomScenes?: any, country?: string | null, curate?: boolean, renderPreview?: (open: () => void) => import("react").ReactNode}} props */
export default function WallSpaceLauncher({initial,variants=[],roomScenes=null,country=null,curate=false,renderPreview}) {
  const {t}=useI18n()
  const [open,setOpen]=useState(false)
  const openSpace=()=>setOpen(true)
  return <>
    {renderPreview?.(openSpace)}
    <Button kind={curate ? 'primary' : 'tertiary'} size={curate ? 'md' : 'sm'} onClick={openSpace}>
      {curate ? t('Abrir curaduría','Open Curate') : t('En tu espacio','In your space')}
    </Button>
    {open && <WallSpace curate={curate} initial={initial} variants={variants} roomScenes={roomScenes} country={country} onClose={()=>setOpen(false)} />}
  </>
}
