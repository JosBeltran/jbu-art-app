import {supabase} from '@/lib/supabaseClient'

export const draftKey='jbu_pending_curated_space'
export const savedSpacesPath='/profile/curadurias'

export async function saveSpace(draft) {
  const {data,error}=await supabase.from('saved_curated_spaces').upsert({
    ...draft,updated_at:new Date().toISOString(),
  }).select('id').single()
  if(error || !data?.id)throw new Error('save_space_failed')
  return data.id
}

export async function roomPhotoData(photo) {
  if(!photo)return null
  if(photo.url.startsWith('data:image/jpeg;base64,'))return photo.url
  const response=await fetch(photo.url)
  if(!response.ok)throw new Error('photo_unavailable')
  const blob=await response.blob()
  if(blob.type!=='image/jpeg' || blob.size>3*1024*1024)throw new Error('photo_invalid')
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(reader.result)
    reader.onerror=reject
    reader.readAsDataURL(blob)
  })
}
