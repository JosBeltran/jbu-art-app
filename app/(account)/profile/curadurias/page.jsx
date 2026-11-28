'use client'

import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {Button,InlineLoading,InlineNotification,Tile} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {useMarket} from '@/components/market/MarketProvider'
import {authHeaders} from '@/lib/authHeaders'
import {supabase} from '@/lib/supabaseClient'
import {draftKey,saveSpace,savedSpacesPath} from '@/components/prints/space/savedSpace'

const WallSpace=dynamic(()=>import('@/components/prints/space/WallSpace'),{ssr:false})

export default function SavedCuratedSpaces() {
  const {t,locale}=useI18n()
  const {country}=useMarket()
  const task=useRef(null)
  const [index,setIndex]=useState({status:'loading',rows:[]})
  const [opened,setOpened]=useState(null)
  const [status,setStatus]=useState('')
  const [refresh,setRefresh]=useState(0)

  useEffect(()=>{
    let active=true
    if(task.current?.refresh!==refresh)task.current={refresh,promise:(async()=>{
      const {data:{user}}=await supabase.auth.getUser()
      if(!user)return {status:'signed-out',rows:[]}
      let draftFailed=false
      const draft=sessionStorage.getItem(draftKey)
      if(draft) {
        try {await saveSpace(JSON.parse(draft));sessionStorage.removeItem(draftKey)}
        catch {draftFailed=true}
      }
      const {data,error}=await supabase.from('saved_curated_spaces').select('id,name,updated_at')
        .order('updated_at',{ascending:false}).order('id')
      if(error)throw error
      return {status:draftFailed?'draft-failed':'ready',rows:data}
    })()}
    task.current.promise.then(result=>{if(active)setIndex(result)})
      .catch(()=>{if(active)setIndex({status:'error',rows:[]})})
    return ()=>{active=false}
  },[refresh])

  async function open(id) {
    setStatus('loading')
    try {
      const response=await fetch('/api/prints/saved-space/'+encodeURIComponent(id),{headers:await authHeaders(),cache:'no-store'})
      if(!response.ok)throw new Error('space_unavailable')
      setOpened(await response.json())
      setStatus('')
    } catch {setStatus('error')}
  }

  return <main style={{maxWidth:'64rem',padding:'var(--cds-spacing-07)',marginInline:'auto',display:'grid',gap:'1rem'}}>
    <Link href="/profile">{t('Mi perfil','My profile')}</Link>
    <h1>{t('Mis curadurías','My curated spaces')}</h1>
    {index.status==='loading' && <InlineLoading description={t('Cargando espacios…','Loading spaces…')} />}
    {index.status==='signed-out' && <Button as={Link} href={'/login?redirect='+encodeURIComponent(savedSpacesPath)}>
      {t('Iniciar sesión','Sign in')}
    </Button>}
    {['error','draft-failed'].includes(index.status) && <>
      <InlineNotification kind="error" lowContrast hideCloseButton title={index.status==='draft-failed'
        ? t('Tu espacio todavía no se guardó.','Your space has not been saved yet.')
        : t('No se pudieron cargar tus espacios.','Your spaces could not be loaded.')} />
      <Button kind="tertiary" onClick={()=>setRefresh(value=>value+1)}>{t('Reintentar','Try again')}</Button>
    </>}
    {index.status==='ready' && !index.rows.length && <p>{t('Guarda tu primer espacio desde Curaduría.','Save your first space from Curate.')}</p>}
    {status==='error' && <InlineNotification kind="error" lowContrast hideCloseButton title={t('No se pudo abrir el espacio.','The space could not be opened.')} />}
    {index.rows.map(row=><Tile key={row.id}>
      <h2>{row.name}</h2>
      <p>{new Date(row.updated_at).toLocaleDateString(locale)}</p>
      <Button kind="ghost" disabled={status==='loading'} onClick={()=>void open(row.id)}>{t('Abrir y editar','Open and edit')}</Button>
    </Tile>)}
    {opened && <WallSpace key={opened.saved.id} curate initial={{artworkId:opened.saved.composition.sourceArtworkId}}
      variants={opened.variants} roomScenes={opened.roomScenes} country={country} savedSpace={opened}
      onClose={()=>{setOpened(null);setRefresh(value=>value+1)}} />}
  </main>
}
