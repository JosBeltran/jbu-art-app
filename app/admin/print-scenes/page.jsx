'use client'

import {useCallback,useEffect,useState} from 'react'
import {Button,Checkbox,Select,SelectItem,TextInput,TextArea} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {authHeaders} from '@/lib/authHeaders'
import RoomScene from '@/components/prints/RoomScene'
import OptimizedImg from '@/components/media/OptimizedImg'
import {roomPlacement,roomPrintPlacement,wallCoordinates,wallPoint,wallTransform} from '@/lib/productCatalog/roomScene'
import styles from './PrintScenes.module.css'

const endpoint='/api/admin/print-scenes'
const sizes={A3:[297,420],A2:[420,594],A1:[594,841]}
const corners=[['Superior izquierda','Top left'],['Superior derecha','Top right'],['Inferior derecha','Bottom right'],['Inferior izquierda','Bottom left']]
const clamp=n=>Math.max(0,Math.min(1,n))

async function request(query='',method='GET',body) {
  const headers=await authHeaders()
  if (body && !(body instanceof FormData)) headers['Content-Type']='application/json'
  const response=await fetch(endpoint+query,{method,headers,body:headers['Content-Type'] ? JSON.stringify(body) : body})
  const result=await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}

export default function PrintScenes() {
  const {t}=useI18n()
  const [library,setLibrary]=useState({scenes:[],families:[]})
  const [draft,setDraft]=useState(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [scope,setScope]=useState('artwork')
  const [target,setTarget]=useState('')
  const [query,setQuery]=useState('')
  const [matches,setMatches]=useState([])
  const [mode,setMode]=useState('rectangle')
  const [handle,setHandle]=useState('center')
  const [size,setSize]=useState('A3')
  const [frame,setFrame]=useState('none')
  const [color,setColor]=useState('black')

  const run=useCallback(async action=>{
    setBusy(true);setMessage('')
    try {await action()} catch(error) {setMessage(error.message)}
    finally {setBusy(false)}
  },[])
  useEffect(()=>{
    let mounted=true
    request().then(result=>{if(mounted) setLibrary(result)})
      .catch(error=>{if(mounted) setMessage(error.message)})
    return ()=>{mounted=false}
  },[])
  const update=fields=>setDraft(previous=>({...previous,...fields}))
  const calibrate=fields=>setDraft(previous=>({...previous,placement:{...previous.placement,...fields}}))
  function saveLocal(scene) {
    setDraft(scene)
    setLibrary(previous=>({...previous,scenes:[...previous.scenes.filter(item=>item.id!==scene.id),scene]
      .sort((a,b)=>a.name.localeCompare(b.name))}))
  }

  function choose(scene) {
    setDraft(scene)
    if (!scene) return
    const [a,b,c,d]=scene.placement.corners
    setMode(a[1]===b[1] && c[1]===d[1] && a[0]===d[0] && b[0]===c[0] ? 'rectangle' : 'perspective')
    setHandle('center')
  }

  function place(x,y) {
    const points=draft.placement.corners
    if (handle==='center') {
      if (roomPlacement(draft.placement)) calibrate({center:wallCoordinates(wallTransform(points),[x,y]).map(clamp)})
      return
    }
    const index=Number(handle)
    if (mode==='perspective') calibrate({corners:points.map((point,i)=>i===index ? [x,y] : point)})
    else {
      const [a,,c]=points
      const left=index===0 ? Math.min(x,c[0]-.02) : a[0], top=index===0 ? Math.min(y,c[1]-.02) : a[1]
      const right=index===2 ? Math.max(x,a[0]+.02) : c[0], bottom=index===2 ? Math.max(y,a[1]+.02) : c[1]
      calibrate({corners:[[left,top],[right,top],[right,bottom],[left,bottom]]})
    }
  }

  const valid=draft && roomPlacement(draft.placement)
  const [widthMm,heightMm]=sizes[size]
  const sample={widthMm,heightMm,framed:frame!=='none',fit:'contain',borderMm:0,
    attributes:{frame_material:frame,frame_color:color}}
  const sampleRoom=valid && roomPrintPlacement(draft,sample)
  const points=draft?.placement.corners
  const center=valid && wallPoint(wallTransform(points),...draft.placement.center)
  const pointIndex=handle==='center' ? null : Number(handle)
  const coords=pointIndex===null ? center : points?.[pointIndex]
  const errors={
    invalid_scene:t('Revisa los datos, la geometría y el archivo JPG o WebP de hasta 4 MB.','Check the fields, geometry and JPG or WebP file up to 4 MB.'),
    scene_image_too_large:t('La fotografía supera 4 MB.','The photograph exceeds 4 MB.'),
    scene_target_already_assigned:t('Ese destino ya tiene un ambiente predeterminado. Retira la asignación anterior para cambiarlo.','That destination already has a default room. Remove the previous assignment to change it.'),
    scene_revision_changed:t('Otra sesión modificó esta escena. Recarga antes de guardar.','Another session edited this scene. Reload before saving.'),
    invalid_scene_target:t('Ese destino ya no está disponible.','That destination is no longer available.'),
  }

  return <section className={styles.page}>
    <h1>{t('Ambientes para Fine Art Prints','Fine Art Prints room scenes')}</h1>
    <form className={styles.fields} onSubmit={event=>{
      event.preventDefault()
      const form=new FormData(event.currentTarget)
      void run(async()=>{const {scene}=await request('','POST',form);saveLocal(scene);choose(scene)})
    }}>
      <h2>{t('Subir fotografía','Upload photograph')}</h2>
      <TextInput id="room-upload-name" name="name" required maxLength={120} labelText={t('Nombre','Name')} />
      <TextInput id="room-license" name="license" required maxLength={500} labelText={t('Fuente y permiso de uso comercial','Source and commercial-use permission')} />
      <label>{t('Fotografía para uso público · JPG o WebP, máximo 4 MB','Photograph for public use · JPG or WebP, up to 4 MB')}
        <input type="file" name="file" accept="image/jpeg,image/webp" required />
      </label>
      <Button type="submit" size="sm" disabled={busy}>{t('Subir como borrador','Upload as draft')}</Button>
    </form>
    <Select id="scene-library" labelText={t('Escena de la biblioteca','Library scene')} value={draft?.id || ''} onChange={event=>choose(library.scenes.find(scene=>scene.id===event.target.value))}>
      <SelectItem value="" text={t('Seleccionar','Select')} />
      {library.scenes.map(scene=><SelectItem key={scene.id} value={scene.id} text={scene.name} />)}
    </Select>
    {message && <p role={message==='saved' ? 'status' : 'alert'}>{message==='saved' ? t('Escena guardada.','Scene saved.') : errors[message] || t('No se pudo completar la operación.','The operation could not be completed.')}</p>}
    {draft && <>
      <div className={styles.grid}>
        <section className={styles.fields}>
          <h2>{t('Calibrar el plano del muro','Calibrate the wall plane')}</h2>
          <p>{t('Marca un área de muro libre de muebles y obstáculos. En perspectiva, mide el ancho y el alto del mismo rectángulo físico.','Mark a wall area clear of furniture and obstructions. For perspective, measure the width and height of the same physical rectangle.')}</p>
          <p>{draft.width} × {draft.height} px</p>
          <div className={styles.calibration}>
            <OptimizedImg src={draft.url} alt={draft.name} width={draft.width} height={draft.height} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polygon points={points.map(([x,y])=>`${x*100},${y*100}`).join(' ')} />
              {center && <circle cx={center[0]*100} cy={center[1]*100} r="1" />}
            </svg>
            <div aria-hidden="true" onClick={event=>{
              const {left,top,width,height}=event.currentTarget.getBoundingClientRect()
              place(clamp((event.clientX-left)/width),clamp((event.clientY-top)/height))
            }} className={styles.clickArea} />
          </div>
          <div className={styles.controls}>
            <Select id="wall-mode" labelText={t('Tipo de plano','Plane type')} value={mode} onChange={event=>{
              const next=event.target.value
              if (next==='rectangle') {
                const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
                const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys)
                calibrate({corners:[[left,top],[right,top],[right,bottom],[left,bottom]]})
              }
              setMode(next);setHandle('center')
            }}>
              <SelectItem value="rectangle" text={t('Rectángulo frontal','Frontal rectangle')} />
              <SelectItem value="perspective" text={t('Cuatro esquinas','Four corners')} />
            </Select>
            <Select id="wall-point" labelText={t('Punto que vas a mover','Point to move')} value={handle} onChange={event=>setHandle(event.target.value)}>
              <SelectItem value="center" text={t('Centro del print','Print center')} />
              {corners.map((label,i)=>(mode==='perspective' || i===0 || i===2) && <SelectItem key={i} value={String(i)} text={t(...label)} />)}
            </Select>
            {coords && [0,1].map(axis=><TextInput key={axis} id={`wall-coordinate-${axis}`} type="number" min={0} max={100} step="0.1"
              labelText={axis===0 ? 'X (%)' : 'Y (%)'} value={Math.round(coords[axis]*1000)/10} onChange={event=>{
                const next=[...coords];next[axis]=clamp(Number(event.target.value)/100);place(...next)
              }} />)}
            {['widthCm','heightCm'].map((field,i)=><TextInput key={field} id={field} type="number" min={10} max={5000} step="any"
              labelText={i ? t('Alto medido (cm)','Measured height (cm)') : t('Ancho medido (cm)','Measured width (cm)')}
              value={draft.placement[field] ?? ''} onChange={event=>calibrate({[field]:event.target.value ? Number(event.target.value) : null})} />)}
          </div>
          {!valid && <p role="alert">{t('Revisa el orden de las esquinas y las medidas.','Check corner order and measurements.')}</p>}
        </section>
        <section className={styles.fields}>
          <h2>{t('Prueba de colocación','Placement preview')}</h2>
          <div className={styles.controls}>
            <Select id="scene-sample-size" labelText={t('Tamaño de muestra','Sample size')} value={size} onChange={event=>setSize(event.target.value)}>
              {Object.keys(sizes).map(value=><SelectItem key={value} value={value} text={value} />)}
            </Select>
            <Select id="scene-sample-frame" labelText={t('Marco de muestra','Sample frame')} value={frame} onChange={event=>{setFrame(event.target.value);setColor('black')}}>
              <SelectItem value="none" text={t('Sin marco','Unframed')} />
              <SelectItem value="wood" text={t('Madera','Wood')} />
              <SelectItem value="aluminum" text={t('Aluminio','Aluminum')} />
            </Select>
            {frame!=='none' && <Select id="scene-sample-color" labelText={t('Color de muestra','Sample color')} value={color} onChange={event=>setColor(event.target.value)}>
              <SelectItem value="black" text={t('Negro','Black')} />
              <SelectItem value="white" text={t('Blanco','White')} />
              {frame==='wood' && <SelectItem value="natural" text="Natural" />}
            </Select>}
          </div>
          {valid && <RoomScene scene={draft} print={sample} source="/logo.png" alt="JBU" />}
          {sampleRoom && <p role="status">{!sampleRoom.fits ? t('La muestra no cabe en el área delimitada.','The sample does not fit in the marked area.')
            : !sampleRoom.calibrated ? t('Vista decorativa sin escala calibrada.','Decorative preview without calibrated scale.')
            : t('Escala del papel calibrada. Los marcos de muestra son ilustrativos.','Paper scale is calibrated. Sample frames are illustrative.')}</p>}
        </section>
      </div>
      <form className={styles.fields} onSubmit={event=>{
        event.preventDefault()
        void run(async()=>{const result=await request('','PATCH',{...draft,action:'save'})
          saveLocal({...result.scene,print_room_scene_targets:draft.print_room_scene_targets});setMessage('saved')})
      }}>
        <h2>{t('Publicación de la escena','Scene publication')}</h2>
        <TextInput id="scene-name" value={draft.name} required maxLength={120} labelText={t('Nombre','Name')} onChange={e=>update({name:e.target.value})} />
        <TextArea id="scene-description" value={draft.description} maxLength={1000} labelText={t('Descripción','Description')} onChange={e=>update({description:e.target.value})} />
        <TextInput id="scene-category" value={draft.category} maxLength={80} labelText={t('Categoría','Category')} onChange={e=>update({category:e.target.value})} />
        <TextInput id="scene-source" value={draft.license} required maxLength={500} labelText={t('Fuente y permiso comercial','Source and commercial permission')} onChange={e=>update({license:e.target.value})} />
        <Select id="scene-family" value={draft.family || ''} labelText={t('Compatibilidad de familia','Family compatibility')} onChange={e=>update({family:e.target.value || null})}>
          <SelectItem value="" text={t('Cualquier familia','Any family')} />
          {library.families.map(f=><SelectItem key={f.code} value={f.code} text={t(f.label_es,f.label_en)} />)}
        </Select>
        <Checkbox id="scene-active" checked={draft.active} labelText={t('Disponible en el configurador público','Available in public configurator')} onChange={(_,data)=>update({active:data.checked})} />
        <Button type="submit" disabled={busy || !valid}>{t('Guardar calibración','Save calibration')}</Button>
      </form>
      <section className={styles.fields}>
        <h2>{t('Ambiente predeterminado para','Default room for')}</h2>
        <Select id="scene-scope" labelText={t('Tipo de asignación','Assignment type')} value={scope} onChange={event=>{setScope(event.target.value);setTarget('');setMatches([])}}>
          <SelectItem value="artwork" text={t('Obra o versión exacta','Artwork or exact version')} />
          <SelectItem value="product" text={t('Producto padre','Parent product')} />
          <SelectItem value="family" text={t('Familia','Family')} />
          <SelectItem value="global" text={t('Catálogo general','Entire catalog')} />
        </Select>
        {['artwork','product'].includes(scope) && <form className={styles.controls} onSubmit={event=>{
          event.preventDefault()
          void run(async()=>{setMatches((await request('?' + new URLSearchParams({scope,query}))).matches);setTarget('')})
        }}>
          <TextInput id="scene-target-query" value={query} labelText={t('Buscar por título','Search by title')} onChange={event=>setQuery(event.target.value)} />
          <Button type="submit" kind="secondary" size="sm" disabled={busy}>{t('Buscar','Search')}</Button>
        </form>}
        {scope!=='global' && <Select id="scene-target" value={target} labelText={t('Destino','Target')} onChange={e=>setTarget(e.target.value)}>
          <SelectItem value="" text={t('Seleccionar','Select')} />
          {scope==='family' ? library.families.map(f=><SelectItem key={f.code} value={f.code} text={t(f.label_es,f.label_en)} />)
            : matches.map(row=><SelectItem key={row.id} value={row.id} text={`${row.title || row.title_es} · ${row.sku}`} />)}
        </Select>}
        <Button kind="secondary" size="sm" disabled={busy || (scope!=='global' && !target)} onClick={()=>void run(async()=>{
          const result=await request('','PATCH',{id:draft.id,action:'assign',scope,target})
          saveLocal({...draft,print_room_scene_targets:[...draft.print_room_scene_targets,result.target]})
        })}>{t('Asignar ambiente','Assign room')}</Button>
        {draft.print_room_scene_targets.map(row=><div key={row.id} className={styles.controls}>
          <p>{row.products ? `${row.products.title_es} · ${row.products.sku}`
            : row.artworks ? `${row.artworks.title} · ${row.artworks.sku}`
            : row.family_code || t('Catálogo general','Entire catalog')}</p>
          <Button kind="ghost" size="sm" disabled={busy} onClick={()=>void run(async()=>{
            await request('','PATCH',{id:draft.id,action:'unassign',target:row.id})
            saveLocal({...draft,print_room_scene_targets:draft.print_room_scene_targets.filter(item=>item.id!==row.id)})
          })}>{t('Retirar asignación','Remove assignment')}</Button>
        </div>)}
      </section>
    </>}
  </section>
}
