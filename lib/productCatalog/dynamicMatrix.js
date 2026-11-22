import {matchesAttributes} from './configuration.js'

export const completedMatrixCache=new Map()
export const matrixCacheKey=input=>JSON.stringify([input.provider,input.catalogId,input.presentationId,input.country])
export function sourcePageNext(page) {
  if(!page || !Number.isSafeInteger(page.offset) || !Number.isSafeInteger(page.sourceCount) || page.sourceCount<0)throw Object.assign(new Error('matrix_pagination_invalid'),{code:'matrix_pagination_invalid'})
  const advance=page.advanceBy ?? page.sourceCount
  if(page.advanceBy!=null && (!Number.isSafeInteger(advance) || advance<1 || advance>100))throw Object.assign(new Error('matrix_pagination_invalid'),{code:'matrix_pagination_invalid'})
  const end=page.offset+advance
  const done=page.explicitNext ? page.nextOffset==null : page.total!=null ? end>=page.total : page.sourceCount===0
  const next=page.explicitNext && page.nextOffset!=null ? page.nextOffset : end
  if(!done && (!Number.isSafeInteger(next) || next<=page.offset))throw Object.assign(new Error('matrix_pagination_stalled'),{code:'matrix_pagination_stalled'})
  return {done,next}
}

export const matrixConfigurationId=row=>JSON.stringify([row.externalId,row.externalVariantId,
  Object.entries(row.configuration || {}).sort(([a],[b])=>a.localeCompare(b))])
export function matrixDimensions(rows) {
  return [...new Set(rows.flatMap(row=>Object.keys(row.attributes || {})))].filter(key=>
    new Set(rows.map(row=>row.attributes[key]).filter(Boolean)).size>1)
}
export function matrixCells(rows,{rowAxis,columnAxis,filters={},maxCells=144}={}) {
  const matching=rows.filter(row=>matchesAttributes(row.attributes || {},filters))
  const values=key=>key ? [...new Set(matching.map(row=>row.attributes[key]).filter(Boolean))] : ['']
  if(values(rowAxis).length*values(columnAxis).length>maxCells)return null
  return values(rowAxis).flatMap(row=>values(columnAxis).map(column=>{
    const candidates=matching.filter(item=>(!rowAxis || item.attributes[rowAxis]===row) && (!columnAxis || item.attributes[columnAxis]===column))
    return {row,column,candidates,state:candidates.length===1 ? 'available' : candidates.length ? 'ambiguous' : 'unavailable'}
  }))
}
export function mergeConfigurationPage(state,result) {
  const page=result.discoveryPage
  if(!page || !Number.isSafeInteger(page.sourceCount) || page.sourceCount<0 || page.offset!==state.offset)
    throw Object.assign(new Error('matrix_pagination_invalid'),{code:'matrix_pagination_invalid'})
  if(page.total!=null && (!Number.isSafeInteger(page.total) || page.total<0 || (page.sourceCount===0 && page.advanceBy==null && !(page.explicitNext && page.nextOffset!=null) || page.explicitNext && page.nextOffset==null) && state.offset+page.sourceCount<page.total))throw Object.assign(new Error('matrix_pagination_invalid'),{code:'matrix_pagination_invalid'})
  const rows=new Map(state.candidates.map(row=>[matrixConfigurationId(row),row]))
  let added=0
  for(const candidate of result.candidates) {
    const id=matrixConfigurationId(candidate)
    if(!rows.has(id))added++
    rows.set(id,{...candidate,configurationId:id,discoveryOffset:rows.get(id)?.discoveryOffset ?? state.offset})
  }
  const {done,next}=sourcePageNext(page)
  // Detect a provider returning the same nonempty source/configuration page forever.
  const signature=JSON.stringify([...(page.sourceIds || result.candidates.map(matrixConfigurationId))].sort())
  const repeated=page.sourceCount>0 && !added && signature===state.signature ? (state.repeated || 0)+1 : 0
  const emptyRepeats=page.sourceCount===0 && !done && page.total==null ? (state.emptyRepeats || 0)+1 : 0
  if(repeated>=2 || emptyRepeats>=3)throw Object.assign(new Error('matrix_pagination_stalled'),{code:'matrix_pagination_stalled'})
  const fields=new Map((state.fields || []).map(field=>[field.id,field]))
  for(const field of result.schema.attributes) {
    const previous=fields.get(field.id)
    fields.set(field.id,{...field,values:[...new Map([...(previous?.values || []),...field.values].map(value=>[value.id,value])).values()]})
  }
  const unresolvedPages={...(state.unresolvedPages || {})}
  delete unresolvedPages[state.offset]
  if(result.unresolved)unresolvedPages[state.offset]=result.unresolved
  const unresolved=Object.values(unresolvedPages).reduce((sum,value)=>sum+value,0)
  return {...state,retrying:false,candidates:[...rows.values()],fields:[...fields.values()],offset:done ? state.offset : next,
    pages:state.pages+1,sourceCount:(state.sourceCount || 0)+page.sourceCount,complete:done && unresolved===0,finished:done,unresolved,unresolvedPages,signature,repeated,emptyRepeats,
    presentation:result.presentation,schema:result.schema,technical:result.technical,updatedAt:new Date().toISOString()}
}
export const newMatrixCheckpoint=()=>({offset:0,pages:0,sourceCount:0,candidates:[],fields:[],complete:false,repeated:0})
export function retryDelay(error,now=Date.now()) {
  if(error.retryAfter) {
    const value=String(error.retryAfter)
    const delay=/^\d+$/.test(value) ? Number(value)*1000 : Date.parse(value)-now
    if(Number.isFinite(delay))return Math.max(0,delay)
  }
  return 1000
}
const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return}
  const aborted=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))}
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve()},ms)
  signal?.addEventListener('abort',aborted,{once:true})
})
export async function discoverMatrix({input,loadPage,checkpoint=newMatrixCheckpoint(),onProgress=()=>{},signal,wait=pause}) {
  let state=checkpoint
  while(!state.complete) {
    if(signal?.aborted)throw new DOMException('Aborted','AbortError')
    let result
    for(let attempt=0;;attempt++) {
      try {result=await loadPage({...input,selection:{},offset:state.offset},{signal});break}
      catch(error) {
        if(signal?.aborted || error.name==='AbortError')throw error
        const delay=retryDelay(error)*2**attempt
        if(attempt>=2 || !['provider_unreachable','provider_rate_limited'].includes(error.code) || delay>10000) {
          error.checkpoint=state;error.retryAt=Date.now()+retryDelay(error);throw error
        }
        onProgress({...state,retrying:true,attempt:attempt+1,retryAt:Date.now()+delay})
        await wait(delay,signal)
      }
    }
    try {state=mergeConfigurationPage(state,result)} catch(error){error.checkpoint=state;throw error}
    onProgress(state)
    if(state.finished && state.unresolved)throw Object.assign(new Error('matrix_configurations_unresolved'),{code:'matrix_configurations_unresolved',checkpoint:{...state,offset:Math.min(...Object.keys(state.unresolvedPages).map(Number))}})
  }
  return state
}

// Browser orchestration uses the same completed matrix in discovery and configuration.
export async function readStudioMatrix({input,loadSnapshot,loadPage,checkpoint,onProgress,signal,refresh=false}) {
  const key=matrixCacheKey(input)
  const cached=completedMatrixCache.get(key)
  if (!refresh && cached?.expiresAt>Date.now()) return cached
  let snapshot
  try {
    const data=await loadSnapshot({...input,refresh},{signal})
    snapshot={value:data.matrix,source:data.cache,expiresAt:Date.now()+5*60000}
  } catch (error) {
    if (signal?.aborted || refresh || ![503,504].includes(error.status)) throw error
    const value=await discoverMatrix({input,loadPage,checkpoint,onProgress,signal})
    snapshot={value,expiresAt:Date.now()+5*60000}
  }
  if (!signal?.aborted) completedMatrixCache.set(key,snapshot)
  return snapshot
}
