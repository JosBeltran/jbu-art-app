const photoTypes=['image/jpeg','image/png','image/webp']
const photoLimit=12*1024*1024

export async function prepareRoomPhoto(file) {
  if (!file || !photoTypes.includes(file.type) || !file.size || file.size>photoLimit) throw new Error('photo_invalid')
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer())
  const format=file.type==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
    : file.type==='image/png' ? [137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)
      : String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP'
  if (!format) throw new Error('photo_invalid')
  const bitmap=await createImageBitmap(file)
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>32_000_000) throw new Error('photo_invalid')
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height))
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(bitmap.width*scale))
    canvas.height=Math.max(1,Math.round(bitmap.height*scale))
    const context=canvas.getContext('2d')
    if (!context) throw new Error('photo_invalid')
    context.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84))
    if (!blob || blob.size>3*1024*1024) throw new Error('photo_invalid')
    return {blob,width:canvas.width,height:canvas.height}
  } finally { bitmap.close() }
}

export async function roomImageColor(url) {
  const response=await fetch(url,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(3500)})
  if (!response.ok) throw new Error('image_unavailable')
  const blob=await response.blob()
  if (blob.size>3*1024*1024) throw new Error('image_unavailable')
  const bitmap=await createImageBitmap(blob,{resizeWidth:16,resizeHeight:16})
  try {
    const canvas=document.createElement('canvas')
    canvas.width=canvas.height=16
    const context=canvas.getContext('2d',{willReadFrequently:true})
    context.drawImage(bitmap,0,0,16,16)
    const data=context.getImageData(0,0,16,16).data
    const sum=[0,0,0]
    for(let i=0;i<data.length;i+=4)for(let channel=0;channel<3;channel++)sum[channel]+=data[i+channel]
    return sum.map(value=>value/256)
  } finally { bitmap.close() }
}
