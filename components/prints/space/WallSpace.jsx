'use client'
import {useEffect,useId,useMemo,useRef,useState} from 'react'
import dynamic from 'next/dynamic'
import {useRouter} from 'next/navigation'
import RoomScene from '@/components/prints/RoomScene'
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'
import {supabase} from '@/lib/supabaseClient'
import {ARTWORK_PLACEHOLDER} from '@/lib/artworkPlaceholder'
import {draftKey,roomPhotoData,saveSpace,savedSpacesPath} from './savedSpace'
import PhotoCalibration from './PhotoCalibration'
import CompositionSummary from './CompositionSummary'
import {Button,ComposedModal,FileUploaderButton,InlineLoading,InlineNotification,ModalBody,ModalFooter,ModalHeader,NumberInput,Select,SelectItem,Slider,Tab,TabList,TabPanel,TabPanels,Tabs,TextInput,Toggle} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {useCurrency} from '@/components/CurrencyProvider'
import {useCart} from '@/context/CartContext'
import OptimizedImg from '@/components/media/OptimizedImg'
import {mockupAppearance} from '@/lib/productCatalog/configuration'
import {customerPrintChoices,customerPrintLabel,customerPrintOptions,printChoiceOrder,resolveCustomerPrint} from '@/lib/productCatalog/customerPrintConfiguration'
import {catalogMoney,marketChoices,marketVariant} from '@/lib/productCatalog/commerce'
import {roomPrintMatrix,roomSceneScope,visualFrameWidth,wallCoordinates,wallTransform} from '@/lib/productCatalog/roomScene'
import {bundleWallPrints,calibratedWall,compositionRoomScenes,maxWallItems,photoWallPlacement,placeWallItem,wallInsertionPosition,wallItemDimensions} from '@/lib/productCatalog/wallSpace'
import {resolveWallPrintSpecification,sameWallSeries,wallPrintAffinity,wallPrintFields,wallPrintMatches,wallPrintSpecification} from '@/lib/productCatalog/wallPrintChoices'
import styles from './WallSpace.module.css'

const Camera=dynamic(()=>import('./WallCamera'),{ssr:false})
const fields={paper:['Papel','Paper'],frame:['Marco','Frame'],size:['Tamaño','Size'],border:['Borde','Margin'],series:['Serie','Series'],orientation:['Orientación','Orientation']}
const emptySources={}
const views=[['product','Producto','Product'],['room','Ambiente','Room'],['photo','Tu espacio','Your space']]
const fullPhoto=[0,0,1,1]
const defaultRectangle=[.18,.15,.82,.78]
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value))
const minorPrice=(row,country,currency)=>row?.variant ? marketVariant(row.variant,country,currency) : null

function printItem(variant,options,sources) {
  const choices=customerPrintChoices(variant)
  const source=variant.gallery.find(image=>image.illustration && image.primary)?.url || sources[variant.id] || variant.spaceImage || variant.gallery[0]?.url
  return {
    variant,options,artworkId:variant.artworkId,title:variant.artworkTitle,titleEn:variant.artworkTitleEn,image:source,
    geometry:{...variant.previewGeometry,framed:choices.framing==='framed',frameWidthMm:variant.frameProfile?.widthMm,
      attributes:{frame_color:choices.frame_color,frame_material:choices.frame_material}},
  }
}

function relativePoint(node,event) {
  const rect=node.getBoundingClientRect()
  return [clamp((event.clientX-rect.left)/rect.width),clamp((event.clientY-rect.top)/rect.height)]
}

function Layer({row,projection,stage,active,label,onActive,onMove}) {
  const frame=visualFrameWidth(row.geometry)
  const [width,height]=wallItemDimensions(row.geometry)
  const appearance=mockupAppearance(row.geometry,row.geometry.borderMm,row.geometry.framed)
  const insetX=10*frame/width,insetY=10*frame/height
  const h=100*height/width
  return <button type="button" className={`${styles.layer} ${active ? styles.layerActive : ''}`} aria-label={label} aria-pressed={active}
    style={{width:100,height:h,border:0,background:appearance?.frameColor || 'white',touchAction:'none',
      transform:roomPrintMatrix(projection.corners,...stage,100,h)}}
    onClick={onActive} onPointerDown={event=>{onActive();event.currentTarget.setPointerCapture(event.pointerId)}}
    onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))onMove(event)}}>
    <span className={styles.paper} style={{inset:`${insetY}% ${insetX}%`}}>
      <span className={styles.paper} style={{inset:`${appearance?.insetY || 0}% ${appearance?.insetX || 0}%`}}>
        <OptimizedImg src={row.image} alt="" className={styles.piece} style={{inset:0,objectFit:row.geometry.fit==='cover'?'cover':'contain'}} />
      </span>
    </span>
  </button>
}

export default function WallSpace({initial,variants,roomScenes,country,onClose,curate=false,savedSpace=null}) {
  const {t,locale}=useI18n()
  const {chargeCurrency}=useCurrency()
  const {addFineArtPrints}=useCart()
  const control=useId()
  const router=useRouter()
  const restored=savedSpace?.saved.composition
  const serial=useRef(restored?.items.length || 1)
  const saveId=useRef(savedSpace?.saved.id || null)
  const saving=useRef(false)
  const stageRef=useRef(null)
  const photoUrl=useRef(null)
  const photoRequest=useRef(0)
  const xr=useRef(null)
  const xrModule=useRef(null)
  const colorSamples=useRef(new Map())
  const xrOverlay=useRef(null)
  const mounted=useRef(false)
  const [wallItems,setWallItems]=useState(()=>{
    if(!restored)return [{...(initial.variant ? printItem(initial.variant,variants,roomScenes?.sources || {}) : initial),instanceId:'piece-0',center:null}]
    return restored.items.map((item,index)=>{
      const options=variants.filter(row=>row.artworkId===item.artworkId && row.previewGeometry)
      const variant=options.find(row=>row.id===item.variantId)
      const artwork=savedSpace.artworks.find(row=>row.id===item.artworkId)
      const piece=variant ? printItem(variant,options,roomScenes?.sources || {}) : {
        artworkId:item.artworkId,unavailableVariantId:item.variantId,options,
        title:artwork?.title || item.title,titleEn:artwork?.titleEn || item.titleEn,
        image:artwork?.image || ARTWORK_PLACEHOLDER,geometry:item.geometry,
      }
      return {...piece,instanceId:'piece-'+index,center:item.center}
    })
  })
  const [activeInstanceId,setActiveInstanceId]=useState('piece-'+(restored?.activeIndex || 0))
  const [saveName,setSaveName]=useState(savedSpace?.saved.name || '')
  const [saveOpen,setSaveOpen]=useState(false)
  const [saveStatus,setSaveStatus]=useState('')
  const [space,setSpace]=useState(null)
  const [relatedError,setRelatedError]=useState(false)
  const [sceneChoice,setSceneChoice]=useState(restored?.sceneChoice || null)
  const [viewMode,setMode]=useState(restored?.viewMode || null)
  const [photo,setPhoto]=useState(()=>savedSpace?.saved.photo_data && restored?.photo
    ? {...restored.photo,url:savedSpace.saved.photo_data} : null)
  const [photoBusy,setPhotoBusy]=useState(false)
  const [photoError,setPhotoError]=useState(false)
  const [camera,setCamera]=useState(false)
  const [rectangle,setRectangle]=useState(restored?.rectangle || defaultRectangle)
  const [widthCm,setWidthCm]=useState(restored?.widthCm || '')
  const [heightCm,setHeightCm]=useState(restored?.heightCm || '')
  const [stage,setStage]=useState(null)
  const [ar,setAr]=useState('checking')
  const [arStep,setArStep]=useState('')
  const [cartStatus,setCartStatus]=useState('')
  const [colors,setColors]=useState(null)
  const [filters,setFilters]=useState({})
  const [sameSpecification,setSameSpecification]=useState(false)
  const [page,setPage]=useState(null)
  const [specResult,setSpecResult]=useState(null)
  const sources=roomScenes?.sources || emptySources
  const active=wallItems.find(row=>row.instanceId===activeInstanceId) || wallItems[0]

  const sourceArtworkId=initial.artworkId || initial.variant?.artworkId
  useEffect(()=>{
    mounted.current=true
    const request=new AbortController()
    async function detect() {
      try {
        const supported=window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')
        if (!supported) {if(!request.signal.aborted)setAr('unsupported');return}
        const engine=await import('./webxrWall')
        if (!request.signal.aborted) {xrModule.current=engine;setAr('ready')}
      } catch {if(!request.signal.aborted)setAr('unsupported')}
    }
    void detect()
    return ()=>{
      mounted.current=false;request.abort()
      if(photoUrl.current) URL.revokeObjectURL(photoUrl.current)
      void xr.current?.end().catch(()=>{})
    }
  },[])

  const sceneGroups=roomScenes?.scenes
  const fallbackScenes=space?.scenes
  const activeArtworkId=active?.artworkId || sourceArtworkId
  const activeProductId=active?.variant?.productId
  const referenceScenes=space?.referenceScenes?.[activeArtworkId]
  const sceneTarget=useMemo(()=>({artworkId:activeArtworkId,productId:activeProductId}),
    [activeArtworkId,activeProductId])
  const sceneScope=roomSceneScope(sceneTarget)
  const availableScenes=useMemo(()=>compositionRoomScenes(sceneGroups || [],
    [...(fallbackScenes || []),...(referenceScenes || [])],sceneTarget),
    [sceneGroups,fallbackScenes,referenceScenes,sceneTarget])
  const chosen=(sceneChoice?.scope===sceneScope && availableScenes.find(scene=>scene.id===sceneChoice.id)) || availableScenes[0]
  const mode=viewMode || (curate ? 'product' : chosen ? 'room' : 'photo')
  const photoPlacement=useMemo(()=>{
    if(!photo)return null
    const [left,top,right,bottom]=rectangle
    return photoWallPlacement([[left,top],[right,top],[right,bottom],[left,bottom]],Number(widthCm),Number(heightCm))
  },[photo,rectangle,widthCm,heightCm])
  const scene=useMemo(()=>mode==='photo' ? (photo ? {...photo,placement:photoPlacement} : null) : mode==='room' ? chosen : null,
    [mode,photo,photoPlacement,chosen])
  const sceneUrl=scene?.url
  const wall=useMemo(()=>calibratedWall(scene),[scene])
  const decorative=mode==='room' && Boolean(scene) && !wall
  const centerFor=row=>row.center || wall?.center || [.5,.5]
  const result=useMemo(()=>wallItems.map(row=>({row,...placeWallItem(scene,row.geometry,row.center || wall?.center || [.5,.5])})),
    [wallItems,scene,wall])
  const insertionPosition=useMemo(()=>wallInsertionPosition(scene,wallItems,activeInstanceId),[scene,wallItems,activeInstanceId])
  const compatible=active?.variant ? marketChoices(active.options,country,chargeCurrency).filter(row=>row.previewGeometry) : []
  const selectedOptions=compatible.some(row=>row.id===active?.variant?.id) ? compatible : active?.options || []
  const name=row=>t(row.title,row.titleEn || row.title)
  const priceLabel=price=>catalogMoney(price.amountMinor,price.currency,locale)

  useEffect(()=>{
    const node=stageRef.current
    if(!node)return
    const resize=new ResizeObserver(([{contentRect}])=>setStage([contentRect.width,contentRect.height]))
    resize.observe(node)
    return ()=>resize.disconnect()
  },[sceneUrl,decorative])

  const seedImage=active?.image
  const seedId=active?.artworkId
  const activeVariant=active?.variant
  const activeGeometry=active?.geometry
  const target=useMemo(()=>wallPrintSpecification(activeVariant),[activeVariant])
  const matchingActive=Boolean(sameSpecification && target)
  const query=new URLSearchParams({artwork:sourceArtworkId,reference:seedId || sourceArtworkId,
    country:country || '',currency:chargeCurrency || ''})
  for(const [field,value] of Object.entries(matchingActive ? {...filters,...target} : filters)) {
    if(value)query.set(field,value)
  }
  const searchKey=query.toString()
  const offset=page?.key===searchKey && space?.key===searchKey ? page.offset : 0
  const currentSearch=space?.key===searchKey ? space : null
  const loading=Boolean(country && chargeCurrency && (!currentSearch || currentSearch.offset!==offset) && relatedError!==searchKey+'|'+offset)
  useEffect(()=>{
    if(!country || !chargeCurrency)return
    const request=new AbortController()
    fetch('/api/prints/space?'+searchKey+'&offset='+offset,{signal:request.signal})
      .then(response=>{if(!response.ok)throw new Error('space_unavailable');return response.json()})
      .then(data=>{
        if(request.signal.aborted)return
        if(!offset)setPage(null)
        setSpace(previous=>({...data,key:searchKey,offset,
          related:offset && previous?.key===searchKey ? [...previous.related,...data.related] : data.related,
          lineage:{...previous?.lineage,...data.lineage},
          referenceScenes: data.referenceScenes ? {...previous?.referenceScenes,[seedId || sourceArtworkId]:data.referenceScenes} : previous?.referenceScenes,
          artworkPrintFormats:{...previous?.artworkPrintFormats,...data.artworkPrintFormats},
        }))
        setRelatedError(false)
      })
      .catch(()=>{if(!request.signal.aborted)setRelatedError(searchKey+'|'+offset)})
    return ()=>request.abort()
  },[searchKey,offset,country,chargeCurrency,seedId,sourceArtworkId])

  const marketGroups=useMemo(()=>(currentSearch?.related || []).map(options=>({
    options,
    available:options.map(variant=>({variant,choices:{...customerPrintChoices(variant),series:variant.series}})),
  })),[currentSearch])
  const filterChoices=space?.facets || {}
  const filtered=useMemo(()=>{
    const applied=matchingActive ? {...filters,...target} : filters
    return marketGroups.flatMap(({options,available})=>{
      const matches=available.filter(entry=>wallPrintMatches(entry.choices,applied))
      return matches.length ? [{options,matches}] : []
    })
  },[marketGroups,matchingActive,filters,target])

  const colorCandidates=useMemo(()=>marketGroups.slice(0,18).map(({options:[variant]})=>
    [variant.artworkId,variant.spaceImage || variant.gallery[0]?.url]),[marketGroups])
  useEffect(()=>{
    if(!colorCandidates.length || !seedImage)return
    let keep=true
    async function sampleColors() {
      const {roomImageColor}=await import('./localPhoto')
      const samples=[[seedId,seedImage],...colorCandidates.filter(([id])=>id!==seedId)]
      const values={}
      for(let i=0;i<samples.length && keep;i+=3) {
        const batch=samples.slice(i,i+3)
        const colors=await Promise.allSettled(batch.map(([,url])=>{
          if(!colorSamples.current.has(url))colorSamples.current.set(url,roomImageColor(url))
          return colorSamples.current.get(url)
        }))
        colors.forEach((result,index)=>{if(result.status==='fulfilled')values[batch[index][0]]=result.value})
      }
      if(keep)setColors({seedImage,values})
    }
    void sampleColors().catch(()=>{})
    return()=>{keep=false}
  },[colorCandidates,seedId,seedImage])

  const related=useMemo(()=>{
    const reference=activeGeometry ? {artworkId:seedId,variant:activeVariant,geometry:activeGeometry,
      series:(seedId===sourceArtworkId ? space?.sourceSeries : null) || activeVariant?.series,
      seriesId:activeVariant?.seriesId || (seedId===sourceArtworkId ? space?.sourceSeriesId : null)} : null
    return filtered.map(({options,matches})=>{
      let best=null
      for(const {variant,choices} of matches) {
        const score=wallPrintAffinity(variant,reference,space?.lineage || {},colors?.seedImage===seedImage ? colors.values : null)+
          (target && wallPrintMatches(choices,target) ? 0.5 : 0)
        if(!best || score>best.score)best={variant,score}
      }
      return {...printItem(best.variant,options,sources),score:best.score,
        sameSeries:Boolean(reference && sameWallSeries(best.variant,reference))}
    }).sort((a,b)=>Number(b.sameSeries)-Number(a.sameSeries) || b.score-a.score || a.artworkId.localeCompare(b.artworkId))
  },[filtered,seedId,seedImage,activeVariant,activeGeometry,space,colors,sources,target,sourceArtworkId])

  function clearFilters() {
    setSameSpecification(false)
    setFilters({})
    setPage(null)
  }

  function setFilter(field,value) {
    setFilters(previous=>({...previous,...(matchingActive ? target : {}),[field]:value}))
    setSameSpecification(false)
    setPage(null)
  }

  function applySpecification() {
    if(!target)return
    const outcomes={}
    let applied=0
    const next=wallItems.map(row=>{
      if(!row.variant || row.instanceId===active.instanceId)return row
      const options=row.options.filter(option=>option.previewGeometry)
      const result=resolveWallPrintSpecification(options,row.variant,target,active.variant.previewGeometry,space?.artworkPrintFormats?.[row.artworkId],country,chargeCurrency)
      if(!result.variant) {
        outcomes[row.instanceId]={variantId:row.variant.id,status:result.status,referenceVariantId:active.variant.id}
        return row
      }
      applied++
      return {...row,...printItem(result.variant,row.options,sources)}
    })
    setWallItems(next)
    setSpecResult({outcomes,applied,country,currency:chargeCurrency})
    setCartStatus('')
  }

  const currentResult=specResult?.country===country && specResult?.currency===chargeCurrency ? specResult : null
  const hasFilters=matchingActive || Object.values(filters).some(Boolean)
  const selection=wallItems.map(row=>{
    const outcome=currentResult?.outcomes[row.instanceId]
    const pending=outcome?.status==='pending' && outcome.variantId===row.variant?.id ? outcome : null
    return {row,id:row.instanceId,title:name(row),pending,price:pending ? null : minorPrice(row,country,chargeCurrency)}
  })
  const ready=selection.filter(item=>item.price)
  const activePrice=ready.find(item=>item.id===active?.instanceId)?.price
  const purchasable=bundleWallPrints(ready.map(item=>item.row))
  const expectedAmounts=Object.fromEntries(ready.map(item=>[item.row.variant.id,item.price.amountMinor]))
  const total=selection.reduce((sum,item)=>sum+(item.price?.amountMinor || 0),0)
  const requests=selection.filter(item=>item.pending).map(({pending})=>({
    variantId:pending.variantId,referenceVariantId:pending.referenceVariantId,
  }))
  const summary=<CompositionSummary items={selection} total={total} country={country} currency={chargeCurrency} />


  function updateActive(row) {
    if(row.instanceId===active?.instanceId && (row.variant?.id!==active.variant?.id || row.artworkId!==active.artworkId))clearOutcome(row.instanceId)
    setWallItems(previous=>previous.map(item=>item.instanceId===row.instanceId ? row : item))
    setCartStatus('')
  }
  function insert(row,replace) {
    if(replace&&active) {
      updateActive({...row,instanceId:active.instanceId,center:active.center});return
    }
    if(wallItems.length>=maxWallItems)return
    const instanceId=`piece-${serial.current++}`
    const center=insertionPosition(row.geometry)
    setWallItems(previous=>[...previous,{...row,instanceId,center}])
    setActiveInstanceId(instanceId);setCartStatus('')
  }
  function clearOutcome(id) {
    setSpecResult(previous=>{
      if(!previous?.outcomes[id])return previous
      const outcomes={...previous.outcomes}
      delete outcomes[id]
      return {...previous,outcomes}
    })
  }
  function discard() {
    if(!active)return
    setWallItems(previous=>previous.filter(row=>row.instanceId!==active.instanceId))
    setActiveInstanceId(wallItems.find(row=>row.instanceId!==active.instanceId)?.instanceId || '')
    clearOutcome(active.instanceId)
    setCartStatus('')
  }
  function move(row,event) {
    if(!wall || !stageRef.current)return
    const center=wallCoordinates(wallTransform(wall.corners),relativePoint(stageRef.current,event)).map(value=>clamp(value))
    if(center.every(Number.isFinite) && placeWallItem(scene,row.geometry,center).projection)updateActive({...row,center})
  }
  function putPhoto(data) {
    if(!mounted.current)return
    if (!data.blob?.size || data.blob.size>3*1024*1024) {setPhotoError(true);return}
    if(photoUrl.current)URL.revokeObjectURL(photoUrl.current)
    const url=URL.createObjectURL(data.blob);photoUrl.current=url
    setPhoto({url,width:data.width,height:data.height})
    setMode('photo');setCamera(false);setRectangle(defaultRectangle);setWidthCm('');setHeightCm('');setPhotoError(false)
  }
  async function upload(event) {
    const file=event.target.files?.[0]
    if(!file)return
    const request=++photoRequest.current
    setPhotoBusy(true);setPhotoError(false)
    try {
      const {prepareRoomPhoto}=await import('./localPhoto')
      const data=await prepareRoomPhoto(file)
      if(mounted.current && photoRequest.current===request)putPhoto(data)
    } catch {if(mounted.current && photoRequest.current===request)setPhotoError(true)}
    finally {if(mounted.current && photoRequest.current===request)setPhotoBusy(false)}
  }
  function fallback() {
    if(mounted.current){setAr('failed');setMode('photo')}
  }
  async function launchAR() {
    if(!wallItems.length || !xrModule.current)return
    setAr('starting');setArStep('scan')
    const coords=wall ? [wall.widthCm,wall.heightCm || wall.widthCm*(scene.height/scene.width)*
      ((wall.corners[3][1]-wall.corners[0][1])/(wall.corners[1][0]-wall.corners[0][0]))] : null
    try {
      await xrModule.current.runWallAR({items:wallItems.map(row=>({...row,center:centerFor(row)})),wall:coords,overlay:xrOverlay.current,
        onSession:session=>{
          if(!mounted.current)return false
          xr.current=session
          setAr('running')
          session.addEventListener('end',()=>{xr.current=null;if(mounted.current)setAr(previous=>previous==='failed'?'failed':'ready')},{once:true})
          return true
        },onWall:setArStep,onFailure:fallback})
    } catch {fallback()}
  }

  async function addActive() {
    if(!activePrice || cartStatus==='loading')return
    setCartStatus('loading')
    const saved=await addFineArtPrints(bundleWallPrints([active]),country,chargeCurrency)
    if(mounted.current)setCartStatus(saved?'saved':'error')
  }

  function buySelection() {
    if((!purchasable.length && !requests.length) || cartStatus==='loading')return
    setCartStatus('loading')
    try {
      sessionStorage.setItem('jbu_curated_selection',JSON.stringify({
        lines:purchasable,requests,country,currency:chargeCurrency,expectedAmounts,locale,
      }))
      router.push('/checkout/selection')
    } catch {
      setCartStatus('error')
    }
  }

  async function persistSpace(event) {
    event.preventDefault()
    if(saving.current || !saveName.trim() || !wallItems.length)return
    saving.current=true
    setSaveStatus('saving')
    try {
      const id=saveId.current || crypto.randomUUID()
      saveId.current=id
      const draft={
        id,name:saveName.trim(),
        composition:{version:1,sourceArtworkId,viewMode:mode,rectangle,widthCm,heightCm,
          sceneChoice:chosen ? {scope:sceneScope,id:chosen.id} : null,
          activeIndex:Math.max(0,wallItems.findIndex(row=>row.instanceId===activeInstanceId)),
          photo:photo ? {width:photo.width,height:photo.height} : null,
          items:wallItems.map(row=>({artworkId:row.artworkId,variantId:row.variant?.id || row.unavailableVariantId || null,
            title:row.title,titleEn:row.titleEn,geometry:row.geometry,center:row.center})),
        },
        photo_data:await roomPhotoData(photo),
      }
      const {data:{user}}=await supabase.auth.getUser()
      if(!user) {
        sessionStorage.setItem(draftKey,JSON.stringify(draft))
        router.push('/login?redirect='+encodeURIComponent(savedSpacesPath))
        return
      }
      await saveSpace(draft)
      setSaveStatus('saved')
    } catch {setSaveStatus('error')}
    finally {saving.current=false}
  }

  return <ComposedModal open size="lg" onClose={onClose}>
    <ModalHeader title={t('Curaduría','Curate')} />
    <ModalBody className={styles.body} hasScrollingContent>
      <div ref={xrOverlay} style={ar==='running'?{position:'fixed',bottom:'1rem',left:'1rem',right:'1rem',background:'var(--cds-layer)',padding:'1rem'}:{display:'none'}}>
        <p role="status">{arStep==='placed'?t('Composición colocada','Arrangement placed'):arStep==='wall'?t('Toca para colocar las piezas','Tap to place the pieces'):t('Apunta a una pared vertical y mueve la cámara despacio','Aim at a vertical wall and move the camera slowly')}</p>
        <Button size="sm" onClick={()=>void xr.current?.end().catch(()=>{})}>{t('Salir de AR','Exit AR')}</Button>
      </div>
      <Tabs selectedIndex={views.findIndex(([id])=>id===mode)}
        onChange={({selectedIndex})=>{const [id]=views[selectedIndex];setMode(id);if(id!=='photo')setCamera(false)}}>
        <TabList aria-label={t('Vista de curaduría','Curate view')}>
          {views.map(([id,es,en])=><Tab key={id}>{t(es,en)}</Tab>)}
        </TabList>
        <TabPanels>
          {views.map(([id])=><TabPanel className={styles.viewPanel} key={id}>
            {id===mode && <div className={styles.section}>
              {mode==='photo' && <div className={styles.actions}>
                {ar==='unsupported' || ar==='failed'
                  ? <small className={styles.arNote} role="status">{ar==='failed'
                      ? t('AR no encontró el muro','AR could not find the wall')
                      : t('AR no disponible','AR unavailable')}</small>
                  : <Button kind="ghost" size="sm" disabled={ar!=='ready'||!wallItems.length} onClick={launchAR}>
                      {t('Abrir realidad aumentada','Open augmented reality')}
                    </Button>}
              </div>}
              {mode==='room' && (chosen ? <Select id={control+'-scene'} labelText={t('Ambiente','Room')} value={chosen.id}
                onChange={event=>{setSceneChoice({scope:sceneScope,id:event.target.value});const next=availableScenes.find(row=>row.id===event.target.value);if(wallItems.length===1)updateActive({...active,center:next.placement.center})}}>
                {availableScenes.map(row=><SelectItem key={row.id} value={row.id} text={row.name} />)}
              </Select> : <p>{t('Esta presentación no tiene un ambiente asignado.','This presentation has no assigned room.')}</p>)}
              {mode==='photo' && <div className={styles.section}>
                <p>{t('La foto se procesa aquí y solo se guarda en tu cuenta si guardas el espacio.','The photo is processed here and saved to your account only when you save the space.')}</p>
                <div className={styles.photoActions}>
                  <FileUploaderButton accept={['image/jpeg','image/png','image/webp']} buttonKind="tertiary" size="sm"
                    labelText={t('Subir foto de la sala','Upload room photo')} onChange={upload} disabled={photoBusy} />
                  <Button kind="tertiary" size="sm" disabled={photoBusy||camera} onClick={()=>setCamera(true)}>{t('Abrir cámara','Open camera')}</Button>
                </div>
                {photoError && <InlineNotification kind="warning" lowContrast hideCloseButton
                  title={t('Elige una foto JPEG, PNG o WebP de hasta 12 MB.','Choose a JPEG, PNG or WebP photo up to 12 MB.')} />}
                {camera && <Camera onPhoto={putPhoto} onClose={()=>setCamera(false)} />}
                {photo && <>
                  <p>{t('Arrastra una marca para ajustar el área. Para moverla, arrastra desde una parte libre en su interior. Ingresa las medidas reales de esa área.','Drag a corner to resize the area. Drag from an uncovered spot inside it to move it. Enter the actual measurements of that area.')}</p>
                  <div className={styles.fields}>
                    <NumberInput id={control+'-w'} label={t('Ancho medido (cm)','Measured width (cm)')} min={10} max={5000} hideSteppers value={widthCm} onChange={(_,data)=>setWidthCm(data.value)} />
                    <NumberInput id={control+'-h'} label={t('Alto medido (cm)','Measured height (cm)')} min={10} max={5000} hideSteppers value={heightCm} onChange={(_,data)=>setHeightCm(data.value)} />
                  </div>
                  <div className={styles.actions}>
                    <Button kind="ghost" size="sm" onClick={()=>setRectangle(defaultRectangle)}>{t('Restablecer área','Reset area')}</Button>
                    <Button kind="ghost" size="sm" onClick={()=>setRectangle(fullPhoto)}>{t('Usar foto completa de frente','Use the full front-facing photo')}</Button>
                  </div>
                  {widthCm && heightCm && !photoPlacement && <InlineNotification kind="warning" lowContrast hideCloseButton
                    title={t('Revisa las medidas del muro.','Check the wall dimensions.')} />}
                </>}
              </div>}
              {mode==='product' && <div className={`${styles.canvas} ${styles.productCanvas}`}>
                {active?.image && <WallArtMockup image={active.image} alt={name(active)} variant={active.geometry}
                  fit={active.geometry.fit==='cover' ? 'cover' : 'contain'} borderMm={active.geometry.borderMm} framed={active.geometry.framed} />}
                {summary}
              </div>}
              {mode!=='product' && !sceneUrl && <div className={`${styles.canvas} ${styles.emptyCanvas}`}>{summary}</div>}
              {decorative && <div className={styles.canvas}>
                {active ? <RoomScene key={scene.id} scene={scene} print={active.geometry}
                  source={active.image} alt={name(active)} /> :
                  <OptimizedImg src={sceneUrl} alt={scene.name} />}
                {summary}
              </div>}
              {decorative && <p>{t('Vista decorativa sin escala calibrada. Para colocar varias piezas, elige un ambiente calibrado o usa Tu espacio.','Decorative preview without calibrated scale. To place several pieces, choose a calibrated room or use Your space.')}</p>}
              {sceneUrl && !decorative && <div className={styles.canvas}>
                <div className={styles.stage} ref={stageRef} style={{aspectRatio:scene.width/scene.height}}>
                  {/* A local blob is rendered directly. It is never sent to the image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sceneUrl} className={styles.wallImage} alt={scene.name || t('Foto de la sala','Room photo')} />
                  {mode==='photo' && <PhotoCalibration rectangle={rectangle} onChange={setRectangle} />}
                  {stage?.every(value=>value>0) && result.map(({row,projection})=>projection &&
                    <Layer key={row.instanceId} row={row} projection={projection} stage={stage} active={row.instanceId===active?.instanceId}
                      label={name(row)} onActive={()=>setActiveInstanceId(row.instanceId)} onMove={event=>move(row,event)} />)}
                </div>
                {summary}
              </div>}
            </div>}
          </TabPanel>)}
        </TabPanels>
      </Tabs>
      {result.filter(item=>wall && item.reason).map(({row,reason})=><InlineNotification key={row.instanceId} kind="warning" lowContrast hideCloseButton
        title={name(row)} subtitle={reason==='tooWide'
          ? t('La pieza es más ancha que el muro calibrado.','This piece is wider than the calibrated wall.')
          : t('La pieza no cabe en la posición actual. Ajusta la posición o elige otro muro.','This piece does not fit at its current position. Adjust it or choose another wall.')} />)}
      {active && <section className={styles.section} aria-label={t('Pieza activa','Active piece')}>
        <div className={styles.actions}>
          <Select id={control+'-piece'} labelText={t('Pieza activa','Active piece')} value={active.instanceId} onChange={event=>setActiveInstanceId(event.target.value)}>
            {wallItems.map((row,index)=><SelectItem key={row.instanceId} value={row.instanceId} text={(index+1)+'. '+name(row)} />)}
          </Select>
          <Button kind="ghost" size="sm" onClick={discard}>{t('Quitar pieza','Remove piece')}</Button>
          {active.variant && <Button kind="ghost" size="sm" disabled={wallItems.length>=maxWallItems} onClick={()=>insert(active,false)}>
            {t('Duplicar print','Duplicate print')}
          </Button>}
          {target && wallItems.some(row=>row.variant && row.instanceId!==active.instanceId) &&
            <Button kind="tertiary" size="sm" disabled={!space && !relatedError} onClick={applySpecification}>
              {t('Aplicar especificación a las demás piezas','Apply specification to other pieces')}
            </Button>}
          {active.variant && <Button kind="tertiary" size="sm" disabled={!activePrice||cartStatus==='loading'} onClick={addActive}>
            {t('Agregar pieza activa al carrito','Add active piece to cart')}
          </Button>}
        </div>
        <p>{wallItemDimensions(active.geometry).map(cm=>new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(cm)).join(' × ')} cm{activePrice && ' · '+priceLabel(activePrice)}</p>
        {wall && <div className={styles.fields}>{[[0,t('Posición horizontal','Horizontal position')],[1,t('Posición vertical','Vertical position')]].map(([axis,label])=>
          <Slider key={axis} id={control+'-axis-'+axis} labelText={label} min={0} max={100}
            value={Math.round(centerFor(active)[axis]*100)} onChange={({value})=>{
              if(Number.isFinite(value))updateActive({...active,center:centerFor(active).map((point,index)=>index===axis ? value/100 : point)})
            }} />)}</div>}
        {active.variant && <div className={styles.fields}>{printChoiceOrder.map(field=>{
          const current=customerPrintChoices(active.variant)[field]
          const options=customerPrintOptions(selectedOptions,active.variant,field)
          if(!options.length)return null
          return <Select key={field} id={control+'-'+field} labelText={t(...fields[field])} value={current || ''}
            onChange={event=>{
              const next=resolveCustomerPrint(selectedOptions,active.variant,field,event.target.value)
              if(next)updateActive({...active,...printItem(next,active.options,sources)})
            }}>
            {!current && <SelectItem value="" text={t('Seleccionar','Select')} />}
            {options.map(({value})=><SelectItem key={value} value={value} text={customerPrintLabel(field,value,t)} />)}
          </Select>
        })}</div>}
      </section>}
      {currentResult && <>
        <p role="status">{t('Piezas con la especificación aplicada','Pieces with specification applied')}: {currentResult.applied}</p>
        {wallItems.map((row,index)=>{
          const outcome=currentResult.outcomes[row.instanceId]
          if(!outcome || outcome.variantId!==row.variant?.id)return null
          const message={
            pending:t('Existe un Artwork Print compatible. La variante solicitada queda pendiente de habilitar.','A compatible Artwork Print exists. The requested variant is pending activation.'),
            missing:t('Esta obra o versión no tiene un Artwork Print con la medida, orientación y borde solicitados.','This artwork or version has no Artwork Print with the requested size, orientation and margin.'),
            unknown:t('No se pudo confirmar si existe un Artwork Print para el formato solicitado.','An Artwork Print for the requested format could not be confirmed.'),
          }[outcome.status]
          return <InlineNotification key={row.instanceId} kind={outcome.status==='pending'?'info':'warning'} lowContrast hideCloseButton
            title={(index+1)+'. '+name(row)}
            subtitle={message+' '+(outcome.status==='pending' ? t('Esta pieza no se cobrará.','This piece will not be charged.') : t('La pieza conserva su configuración y precio anteriores.','The piece keeps its previous configuration and price.'))} />
        })}
      </>}
      <section className={styles.section} aria-label={t('Prints compatibles','Compatible prints')}>
        <h3>{t('Prints compatibles','Compatible prints')}</h3>
        {loading && <InlineLoading description={t('Buscando opciones…','Finding options…')} />}
        {relatedError===searchKey+'|'+offset && <p role="status">{t('No se pudieron cargar las sugerencias. Puedes seguir usando la composición.','Suggestions could not be loaded. You can continue using the arrangement.')}</p>}
        {Boolean(space) && <>
          {target && <Toggle id={control+'-same'} labelText={t('Misma configuración actual','Same current configuration')}
            labelA={t('Desactivado','Off')} labelB={t('Activado','On')} toggled={matchingActive}
            onToggle={value=>{
              setSameSpecification(value)
              setFilters(previous=>Object.fromEntries(Object.entries(previous).filter(([field])=>!printChoiceOrder.includes(field))))
              setPage(null)
            }} />}
          <div className={styles.fields}>{wallPrintFields.map(field=>{
            const value=(matchingActive && target[field]) || filters[field] || ''
            const options=[...new Set([...(filterChoices[field] || []),...(value ? [value] : [])])].sort()
            if(!options.length)return null
            return <Select key={field} id={control+'-filter-'+field} labelText={t(...fields[field])}
              value={value} onChange={event=>setFilter(field,event.target.value)}>
              <SelectItem value="" text={t('Cualquiera','Any')} />
              {options.map(option=><SelectItem key={option} value={option}
                text={field==='series' ? option : customerPrintLabel(field,option,t)} />)}
            </Select>
          })}</div>
          {hasFilters && <Button kind="ghost" size="sm" onClick={clearFilters}>{t('Limpiar filtros','Clear filters')}</Button>}
        </>}
        {currentSearch && !related.length && !loading && <p role="status">{hasFilters
          ? t('Ningún print coincide con estos filtros.','No prints match these filters.')
          : t('Sin sugerencias en el destino y la moneda actuales.','No suggestions for the current destination and currency.')}</p>}
        <div className={styles.related}>{[...(initial.variant && space?.original && !hasFilters ? [space.original] : []),...related].map(row=>
          <article key={row.artworkId} className={styles.card}>
            <OptimizedImg src={row.image} alt="" variant="thumbnail" /><strong>{name(row)}</strong>
            <div className={styles.actions}>
              <Button kind="ghost" size="sm" disabled={!active} onClick={()=>insert(row,true)}>{t('Reemplazar actual','Replace current')}</Button>
              <Button kind="tertiary" size="sm" disabled={wallItems.length>=maxWallItems} onClick={()=>insert(row,false)}>{t('Añadir a la visualización','Add to arrangement')}</Button>
            </div>
          </article>)}</div>
        {currentSearch?.nextOffset!=null && <Button kind="tertiary" size="sm" disabled={loading}
          onClick={()=>setPage({key:searchKey,offset:currentSearch.nextOffset})}>
          {t('Cargar más prints','Load more prints')}
        </Button>}
      </section>
      {wallItems.some(row=>row.unavailableVariantId) && <InlineNotification kind="warning" lowContrast hideCloseButton
        title={t('Algunas presentaciones guardadas ya no están disponibles.','Some saved presentations are no longer available.')}
        subtitle={t('Puedes reemplazarlas por prints del catálogo.','You can replace them with prints from the catalog.')} />}
      {wallItems.some(row=>row.variant && !minorPrice(row,country,chargeCurrency)) && <p role="status">
        {t('Los prints sin precio para tu destino o moneda siguen en la visualización.','Prints without a price for your destination or currency stay in the arrangement.')}
      </p>}
      {cartStatus==='saved' && <p role="status">{t('Prints agregados al carrito.','Prints added to your cart.')}</p>}
      {cartStatus==='error' && <InlineNotification lowContrast kind="error" hideCloseButton
        title={t('No se pudo agregar la selección al carrito.','The selection could not be added to your cart.')}
        subtitle={t('Revisa la disponibilidad, el destino y la moneda del carrito.','Check availability, delivery country and cart currency.')} />}
      {saveOpen && <form id={control+'-save-space'} onSubmit={persistSpace} className={styles.section}>
        <TextInput id={control+'-space-name'} labelText={t('Nombre del espacio','Space name')}
          placeholder={t('Ej. Sala o Habitación 204','E.g. Living room or Room 204')} value={saveName}
          required maxLength={100} onChange={event=>{setSaveName(event.target.value);setSaveStatus('')}} />
        {photo && <p>{t('La foto y la calibración se guardarán de forma privada en tu perfil.','The photo and calibration will be saved privately in your profile.')}</p>}
        <Button type="submit" size="sm" disabled={saveStatus==='saving'||!saveName.trim()||!wallItems.length}>
          {t('Guardar en mi perfil','Save to my profile')}
        </Button>
        {saveStatus==='saved' && <p role="status">{t('Espacio guardado en Mis curadurías.','Space saved in My curated spaces.')}</p>}
        {saveStatus==='error' && <InlineNotification kind="error" lowContrast hideCloseButton
          title={t('No se pudo guardar el espacio.','The space could not be saved.')} />}
      </form>}
    </ModalBody>
    <ModalFooter>
      <Button kind="secondary" onClick={onClose}>{t('Cerrar','Close')}</Button>
      <Button kind="tertiary" disabled={!wallItems.length} aria-expanded={saveOpen} aria-controls={saveOpen ? control+'-save-space' : undefined}
        onClick={()=>{
          setSaveOpen(!saveOpen)
          if(!saveOpen)requestAnimationFrame(()=>document.getElementById(control+'-space-name')?.focus())
        }}>{t('Guardar espacio','Save space')}</Button>
      <Button disabled={(!purchasable.length&&!requests.length)||cartStatus==='loading'} onClick={buySelection}>
        {purchasable.length ? t('Comprar selección','Buy selection')+' · '+catalogMoney(total,chargeCurrency,locale)
          : t('Enviar solicitudes','Submit requests')}
      </Button>
    </ModalFooter>
  </ComposedModal>
}
