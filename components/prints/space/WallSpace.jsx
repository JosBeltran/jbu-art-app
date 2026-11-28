'use client'
import {useEffect,useId,useRef,useState} from 'react'
import dynamic from 'next/dynamic'
import {Button,ComposedModal,FileUploaderButton,InlineLoading,InlineNotification,ModalBody,ModalFooter,ModalHeader,NumberInput,Select,SelectItem,Slider} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {useCurrency} from '@/components/CurrencyProvider'
import {useCart} from '@/context/CartContext'
import OptimizedImg from '@/components/media/OptimizedImg'
import {mockupAppearance} from '@/lib/productCatalog/configuration'
import {customerPrintChoices,customerPrintLabel,customerPrintOptions,printChoiceOrder,resolveCustomerPrint} from '@/lib/productCatalog/customerPrintConfiguration'
import {catalogMoney,marketChoices,marketVariant} from '@/lib/productCatalog/commerce'
import {roomPrintMatrix,visualFrameWidth,wallCoordinates,wallTransform} from '@/lib/productCatalog/roomScene'
import {bundleWallPrints,calibratedWall,maxWallItems,photoWallPlacement,placeWallItem,wallItemDimensions} from '@/lib/productCatalog/wallSpace'
import styles from './WallSpace.module.css'

const Camera=dynamic(()=>import('./WallCamera'),{ssr:false})
const fields={paper:['Papel','Paper'],frame:['Marco','Frame'],size:['Tamaño','Size'],border:['Borde','Margin']}
const fullPhoto=[[0,0],[1,0],[1,1],[0,1]]
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

export default function WallSpace({initial,variants,roomScenes,country,onClose}) {
  const {t,locale}=useI18n()
  const {chargeCurrency}=useCurrency()
  const {addFineArtPrints}=useCart()
  const control=useId()
  const serial=useRef(1)
  const stageRef=useRef(null)
  const photoUrl=useRef(null)
  const photoRequest=useRef(0)
  const xr=useRef(null)
  const xrModule=useRef(null)
  const colorSamples=useRef(new Map())
  const xrOverlay=useRef(null)
  const mounted=useRef(false)
  const [wallItems,setWallItems]=useState(()=>[{...(initial.variant
    ? printItem(initial.variant,variants,roomScenes?.sources || {})
    : initial),instanceId:'piece-0',center:null}])
  const [activeInstanceId,setActiveInstanceId]=useState('piece-0')
  const [space,setSpace]=useState(null)
  const [relatedError,setRelatedError]=useState(false)
  const [sceneId,setSceneId]=useState('')
  const [viewMode,setMode]=useState(null)
  const [photo,setPhoto]=useState(null)
  const [photoBusy,setPhotoBusy]=useState(false)
  const [photoError,setPhotoError]=useState(false)
  const [camera,setCamera]=useState(false)
  const [corners,setCorners]=useState([])
  const [widthCm,setWidthCm]=useState('')
  const [heightCm,setHeightCm]=useState('')
  const [stage,setStage]=useState(null)
  const [ar,setAr]=useState('checking')
  const [arStep,setArStep]=useState('')
  const [cartStatus,setCartStatus]=useState('')
  const [colors,setColors]=useState(null)
  const sources=roomScenes?.sources || {}
  const active=wallItems.find(row=>row.instanceId===activeInstanceId) || wallItems[0]

  const sourceArtworkId=initial.artworkId || initial.variant?.artworkId
  useEffect(()=>{
    mounted.current=true
    const request=new AbortController()
    fetch('/api/prints/space?artwork='+encodeURIComponent(sourceArtworkId),{signal:request.signal})
      .then(response=>{if(!response.ok)throw new Error('space_unavailable');return response.json()})
      .then(data=>{if(!request.signal.aborted)setSpace(data)})
      .catch(()=>{if(!request.signal.aborted)setRelatedError(true)})
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
  },[sourceArtworkId])

  const availableScenes=[...new Map([...(roomScenes?.scenes || []),...(space?.scenes || [])]
    .filter(calibratedWall).map(scene=>[scene.id,scene])).values()]
  const chosen=availableScenes.find(scene=>scene.id===sceneId) ||
    availableScenes.find(scene=>placeWallItem(scene,wallItems[0]?.geometry || {},scene.placement.center).projection) || availableScenes[0]
  const mode=viewMode || (chosen ? 'room' : 'photo')
  const photoPlacement=photo && photoWallPlacement(corners,Number(widthCm),Number(heightCm))
  const scene=mode==='photo' ? (photo ? {...photo,placement:photoPlacement} : null) : chosen
  const sceneUrl=scene?.url
  const wall=calibratedWall(scene)
  const centerFor=row=>row.center || wall?.center || [.5,.5]
  const result=wallItems.map(row=>({row,...placeWallItem(scene,row.geometry,centerFor(row))}))
  const purchasable=bundleWallPrints(wallItems.filter(row=>minorPrice(row,country,chargeCurrency)))
  const activePrice=minorPrice(active,country,chargeCurrency)
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
  },[sceneUrl])

  const seedImage=active?.image
  useEffect(()=>{
    if(!space?.related?.length || !seedImage)return
    let keep=true
    async function rank() {
      const {roomImageColor}=await import('./localPhoto')
      const samples=[seedImage,...space.related.map(group=>group[0].spaceImage || group[0].gallery[0].url)]
      const values=[]
      for(let i=0;i<samples.length;i+=3) {
        values.push(...await Promise.allSettled(samples.slice(i,i+3).map(url=>{
          if(!colorSamples.current.has(url))colorSamples.current.set(url,roomImageColor(url))
          return colorSamples.current.get(url)
        })))
      }
      if(keep)setColors(values.map(sample=>sample.status==='fulfilled' ? sample.value : null))
    }
    void rank()
    return()=>{keep=false}
  },[space,seedImage])

  const related=(space?.related || []).flatMap((options,index)=>{
    const candidates=marketChoices(options,country,chargeCurrency).filter(row=>row.previewGeometry)
    const variant=candidates[0]
    if(!variant)return []
    const geometry=active?.geometry
    const ratio=geometry ? geometry.widthMm/geometry.heightMm : 1
    const color=colors?.[index+1], base=colors?.[0]
    const affinity=color && base ? Math.hypot(...color.map((value,i)=>value-base[i]))/440 : .5
    const score=(variant.series && variant.series===active?.variant?.series ? -2 : 0)+affinity
      +Math.abs(Math.log((variant.previewGeometry.widthMm/variant.previewGeometry.heightMm)/ratio))
    return [{...printItem(variant,options,sources),score}]
  }).sort((a,b)=>a.score-b.score).slice(0,6)

  function updateActive(row) {
    setWallItems(previous=>previous.map(item=>item.instanceId===row.instanceId ? row : item))
    setCartStatus('')
  }
  function insert(row,replace) {
    if(replace&&active) {
      updateActive({...row,instanceId:active.instanceId,center:active.center});return
    }
    if(wallItems.length>=maxWallItems)return
    const instanceId=`piece-${serial.current++}`
    const center=wallItems.length ? [clamp(.5+(wallItems.length%2 ? 1 : -1)*.23),clamp(.5+Math.floor(wallItems.length/3)*.13,0,.8)]
      : wall?.center || [.5,.5]
    setWallItems(previous=>[...previous,{...row,instanceId,center}])
    setActiveInstanceId(instanceId);setCartStatus('')
  }
  function discard() {
    if(!active)return
    setWallItems(previous=>previous.filter(row=>row.instanceId!==active.instanceId))
    setActiveInstanceId(wallItems.find(row=>row.instanceId!==active.instanceId)?.instanceId || '')
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
    setMode('photo');setCamera(false);setCorners([]);setWidthCm('');setHeightCm('');setPhotoError(false)
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

  async function add(all) {
    const lines=all ? purchasable : activePrice ? bundleWallPrints([active]) : []
    if(!lines.length || cartStatus==='loading')return
    setCartStatus('loading')
    const saved=await addFineArtPrints(lines,country,chargeCurrency)
    if(mounted.current)setCartStatus(saved?'saved':'error')
  }

  return <ComposedModal open size="lg" onClose={onClose}>
    <ModalHeader title={t('En tu espacio','In your space')} />
    <ModalBody className={styles.body} hasScrollingContent>
      <div className={styles.actions}>
        <Button kind={mode==='room'?'secondary':'tertiary'} size="sm" aria-pressed={mode==='room'} onClick={()=>setMode('room')}>{t('Ambiente calibrado','Calibrated room')}</Button>
        <Button kind={mode==='photo'?'secondary':'tertiary'} size="sm" aria-pressed={mode==='photo'} onClick={()=>setMode('photo')}>{t('Foto de mi sala','Photo of my room')}</Button>
        {ar!=='unsupported' && <Button kind="tertiary" size="sm" disabled={ar==='checking'||ar==='starting'||ar==='running'||!wallItems.length} onClick={launchAR}>{t('Abrir realidad aumentada','Open augmented reality')}</Button>}
      </div>
      {['failed','unsupported'].includes(ar) && <InlineNotification lowContrast kind="info" hideCloseButton
        title={ar==='failed'?t('No se pudo iniciar o calibrar AR','AR could not start or find a wall'):t('AR no está disponible en este dispositivo','AR is unavailable on this device')}
        subtitle={t('Puedes usar una foto de tu sala o un ambiente calibrado.','You can use a room photo or a calibrated room.')} />}
      <div ref={xrOverlay} style={ar==='running'?{position:'fixed',bottom:'1rem',left:'1rem',right:'1rem',background:'var(--cds-layer)',padding:'1rem'}:{display:'none'}}>
        <p role="status">{arStep==='placed'?t('Composición colocada','Arrangement placed'):arStep==='wall'?t('Toca para colocar las piezas','Tap to place the pieces'):t('Apunta a una pared vertical y mueve la cámara despacio','Aim at a vertical wall and move the camera slowly')}</p>
        <Button size="sm" onClick={()=>void xr.current?.end().catch(()=>{})}>{t('Salir de AR','Exit AR')}</Button>
      </div>
      {mode==='room' && (chosen ? <Select id={control+'-scene'} labelText={t('Ambiente','Room')} value={chosen.id}
        onChange={event=>{setSceneId(event.target.value);const next=availableScenes.find(row=>row.id===event.target.value);if(wallItems.length===1)updateActive({...active,center:next.placement.center})}}>
        {availableScenes.map(row=><SelectItem key={row.id} value={row.id} text={row.name} />)}
      </Select> : <p>{t('Sube una foto para medir tu muro o abre AR.','Upload a photo to measure your wall or open AR.')}</p>)}
      {mode==='photo' && <div className={styles.section}>
        <p>{t('La foto se procesa en este dispositivo.','The photo is processed on this device.')}</p>
        <div className={styles.actions}>
          <FileUploaderButton accept={['image/jpeg','image/png','image/webp']} buttonKind="tertiary" size="sm"
            labelText={t('Subir foto de la sala','Upload room photo')} onChange={upload} disabled={photoBusy} />
          <Button kind="tertiary" size="sm" disabled={photoBusy||camera} onClick={()=>setCamera(true)}>{t('Abrir cámara','Open camera')}</Button>
        </div>
        {photoError && <InlineNotification kind="warning" lowContrast hideCloseButton
          title={t('Elige una foto JPEG, PNG o WebP de hasta 12 MB.','Choose a JPEG, PNG or WebP photo up to 12 MB.')} />}
        {camera && <Camera onPhoto={putPhoto} onClose={()=>setCamera(false)} />}
        {photo && <>
          <p>{t('Marca las cuatro esquinas de un rectángulo medido del muro, en cualquier orden.','Mark the four corners of a measured wall rectangle in any order.')}</p>
          <div className={styles.fields}>
            <NumberInput id={control+'-w'} label={t('Ancho medido (cm)','Measured width (cm)')} min={10} max={5000} hideSteppers value={widthCm} onChange={(_,data)=>setWidthCm(data.value)} />
            <NumberInput id={control+'-h'} label={t('Alto medido (cm)','Measured height (cm)')} min={10} max={5000} hideSteppers value={heightCm} onChange={(_,data)=>setHeightCm(data.value)} />
          </div>
          <div className={styles.actions}>
            <Button kind="ghost" size="sm" onClick={()=>setCorners([])}>{t('Volver a marcar esquinas','Mark corners again')}</Button>
            <Button kind="ghost" size="sm" onClick={()=>setCorners(fullPhoto)}>{t('Usar foto completa de frente','Use the full front-facing photo')}</Button>
          </div>
          {corners.length===4 && !photoPlacement && <InlineNotification kind="warning" lowContrast hideCloseButton
            title={t('Revisa las esquinas y las medidas del muro.','Check the wall corners and dimensions.')} />}
        </>}
      </div>}
      {sceneUrl && <div className={styles.stage} ref={stageRef} style={{aspectRatio:scene.width/scene.height}}>
        {/* A local blob is rendered directly. It is never sent to the image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sceneUrl} className={styles.wallImage} alt={scene.name || t('Foto de la sala','Room photo')} />
        {mode==='photo' && corners.length<4 && <button type="button" className={styles.calibrationTarget}
          aria-label={t('Marcar esquina del muro','Mark wall corner')} onClick={event=>{
            if(event.detail>0)setCorners(previous=>[...previous,relativePoint(stageRef.current,event)])
          }} />}
        {mode==='photo' && (photoPlacement?.corners || corners).map(([x,y],index)=><span className={styles.marker} aria-hidden key={index} style={{left:x*100+'%',top:y*100+'%'}}>{index+1}</span>)}
        {stage?.every(value=>value>0) && result.map(({row,projection})=>projection &&
          <Layer key={row.instanceId} row={row} projection={projection} stage={stage} active={row.instanceId===active?.instanceId}
            label={name(row)} onActive={()=>setActiveInstanceId(row.instanceId)} onMove={event=>move(row,event)} />)}
      </div>}
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
          {active.variant && <Button kind="tertiary" size="sm" disabled={!activePrice||cartStatus==='loading'} onClick={()=>add(false)}>
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
      <section className={styles.section} aria-label={t('Prints compatibles','Compatible prints')}>
        <h3>{t('Prints compatibles','Compatible prints')}</h3>
        {!space && !relatedError && <InlineLoading description={t('Buscando opciones…','Finding options…')} />}
        {relatedError && <p role="status">{t('No se pudieron cargar las sugerencias. Puedes seguir usando la composición.','Suggestions could not be loaded. You can continue using the arrangement.')}</p>}
        {space && !related.length && <p>{t('Sin sugerencias en el destino y la moneda actuales.','No suggestions for the current destination and currency.')}</p>}
        <div className={styles.related}>{[...(initial.variant && space?.original ? [space.original] : []),...related].map(row=>
          <article key={row.artworkId} className={styles.card}>
            <OptimizedImg src={row.image} alt="" variant="thumbnail" /><strong>{name(row)}</strong>
            <div className={styles.actions}>
              <Button kind="ghost" size="sm" disabled={!active} onClick={()=>insert(row,true)}>{t('Reemplazar actual','Replace current')}</Button>
              <Button kind="tertiary" size="sm" disabled={wallItems.length>=maxWallItems} onClick={()=>insert(row,false)}>{t('Añadir a la visualización','Add to arrangement')}</Button>
            </div>
          </article>)}</div>
      </section>
      {wallItems.some(row=>row.variant && !minorPrice(row,country,chargeCurrency)) && <p role="status">
        {t('Los prints sin precio para tu destino o moneda siguen en la visualización.','Prints without a price for your destination or currency stay in the arrangement.')}
      </p>}
      {cartStatus==='saved' && <p role="status">{t('Prints agregados al carrito.','Prints added to your cart.')}</p>}
      {cartStatus==='error' && <InlineNotification lowContrast kind="error" hideCloseButton
        title={t('No se pudo agregar la selección al carrito.','The selection could not be added to your cart.')}
        subtitle={t('Revisa la disponibilidad, el destino y la moneda del carrito.','Check availability, delivery country and cart currency.')} />}
    </ModalBody>
    <ModalFooter>
      <Button kind="secondary" onClick={onClose}>{t('Cerrar','Close')}</Button>
      <Button disabled={!purchasable.length||cartStatus==='loading'} onClick={()=>add(true)}>
        {t('Agregar prints disponibles','Add available prints')} ({purchasable.reduce((total,line)=>total+line.quantity,0)})
      </Button>
    </ModalFooter>
  </ComposedModal>
}
