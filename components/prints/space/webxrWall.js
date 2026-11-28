import {wallItemDimensions} from '@/lib/productCatalog/wallSpace'
import {mockupAppearance} from '@/lib/productCatalog/configuration'

function renderer(gl) {
  const program=gl.createProgram()
  const shaders=[
    [gl.VERTEX_SHADER,`attribute vec2 p; varying vec2 uv;
      uniform mat4 view,projection; uniform vec3 origin,right; uniform vec4 rect;
      void main(){uv=vec2(p.x,1.0-p.y);
      vec2 q=rect.xy+(p-vec2(.5))*rect.zw;
      gl_Position=projection*view*vec4(origin+right*q.x+vec3(0,q.y,0),1.0);}`],
    [gl.FRAGMENT_SHADER,'precision mediump float; varying vec2 uv; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,uv);}'],
  ]
  for(const [type,code] of shaders) {
    const shader=gl.createShader(type)
    gl.shaderSource(shader,code);gl.compileShader(shader)
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error('ar_render_failed')
    gl.attachShader(program,shader);gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('ar_render_failed')
  gl.useProgram(program)
  const buffer=gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer)
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW)
  const position=gl.getAttribLocation(program,'p')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
  return Object.fromEntries(['view','projection','origin','right','rect','image'].map(name=>[name,gl.getUniformLocation(program,name)]))
}

async function textureFor(gl,row) {
  const response=await fetch(row.image,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(8000)})
  if(!response.ok) throw new Error('ar_image_unavailable')
  const blob=await response.blob()
  if(blob.size>10*1024*1024) throw new Error('ar_image_unavailable')
  const image=await createImageBitmap(blob,{resizeWidth:768,resizeQuality:'medium'})
  try {
    const [width,height]=wallItemDimensions(row.geometry)
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(768*Math.min(1,width/height)))
    canvas.height=Math.max(1,Math.round(768*Math.min(1,height/width)))
    const context=canvas.getContext('2d')
    const appearance=mockupAppearance(row.geometry,row.geometry.borderMm,row.geometry.framed)
    const fx=(width-row.geometry.widthMm/10)*canvas.width/(2*width)
    const fy=(height-row.geometry.heightMm/10)*canvas.height/(2*height)
    const paperWidth=canvas.width-2*fx,paperHeight=canvas.height-2*fy
    context.fillStyle=appearance?.frameColor || 'white'
    context.fillRect(0,0,canvas.width,canvas.height)
    context.fillStyle='white'
    context.fillRect(fx,fy,paperWidth,paperHeight)
    const x=fx+paperWidth*(appearance?.insetX || 0)/100
    const y=fy+paperHeight*(appearance?.insetY || 0)/100
    const w=canvas.width-2*x,h=canvas.height-2*y
    const scale=row.geometry.fit==='cover' ? Math.max(w/image.width,h/image.height) : Math.min(w/image.width,h/image.height)
    context.beginPath();context.rect(x,y,w,h);context.clip()
    context.drawImage(image,(canvas.width-image.width*scale)/2,(canvas.height-image.height*scale)/2,
      image.width*scale,image.height*scale)
    const texture=gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D,texture)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas)
    return texture
  } finally {image.close()}
}

export async function runWallAR({items,wall,overlay,onSession,onWall,onFailure}) {
  // Must run directly from the button gesture, before fetching any textures.
  const session=await navigator.xr.requestSession('immersive-ar',{
    requiredFeatures:['hit-test'],optionalFeatures:['dom-overlay'],domOverlay:{root:overlay},
  })
  if(!onSession(session)) {await session.end();return}
  const canvas=document.createElement('canvas')
  const gl=canvas.getContext('webgl',{xrCompatible:true,alpha:true})
  let hit, timer, ended=false
  const cleanup=()=>{
    ended=true;clearTimeout(timer);hit?.cancel()
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  }
  session.addEventListener('end',cleanup,{once:true})
  try {
    if(!gl) throw new Error('ar_render_failed')
    await gl.makeXRCompatible?.()
    const layer=new XRWebGLLayer(session,gl,{alpha:true})
    session.updateRenderState({baseLayer:layer})
    const [space,viewer]=await Promise.all([session.requestReferenceSpace('local'),session.requestReferenceSpace('viewer')])
    hit=await session.requestHitTestSource({space:viewer,entityTypes:['plane']})
    const uniforms=renderer(gl)
    const pieces=[]
    let offset=0
    for(const row of items) {
      const [width,height]=wallItemDimensions(row.geometry).map(cm=>cm/100)
      const texture=await textureFor(gl,row)
      if(ended)return
      pieces.push({texture,width,height,x:wall ? (row.center[0]-.5)*wall[0]/100 : offset+width/2,
        y:wall ? (.5-row.center[1])*wall[1]/100 : 0})
      offset+=width+.06
    }
    if(!wall) for(const piece of pieces) piece.x-=(offset-.06)/2
    let anchor,current,detected=false
    session.addEventListener('select',()=>{
      if(current) {anchor=current;clearTimeout(timer);onWall('placed')}
    })
    timer=setTimeout(()=>{if(!anchor&&!ended){onFailure();void session.end().catch(()=>{})}},25000)
    function frame(_,xrFrame) {
      if(ended)return
      try {
        drawFrame(xrFrame)
        session.requestAnimationFrame(frame)
      } catch {
        onFailure()
        void session.end().catch(()=>{})
      }
    }
    function drawFrame(xrFrame) {
      const pose=xrFrame.getViewerPose(space)
      if(!pose)return
      current=null
      for(const candidate of xrFrame.getHitTestResults(hit)) {
        const matrix=candidate.getPose(space)?.transform.matrix
        if(!matrix || Math.abs(matrix[5])>.35)continue
        const [x,y,z]=matrix.slice(12,15)
        const [vx,,vz]=pose.transform.matrix.slice(12,15)
        const direction=(vx-x)*matrix[4]+(vz-z)*matrix[6]>=0 ? 1 : -1
        const length=Math.hypot(matrix[4],matrix[6])
        const nx=direction*matrix[4]/length,nz=direction*matrix[6]/length
        current={origin:[x+.008*nx,y,z+.008*nz],right:[nz,0,-nx]}
        break
      }
      if(Boolean(current)!==detected&&!anchor){detected=Boolean(current);onWall(detected?'wall':'scan')}
      const location=anchor || current
      gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer)
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)
      if(!location)return
      gl.uniform3fv(uniforms.origin,location.origin);gl.uniform3fv(uniforms.right,location.right)
      for(const view of pose.views) {
        const viewport=layer.getViewport(view)
        gl.viewport(viewport.x,viewport.y,viewport.width,viewport.height)
        gl.uniformMatrix4fv(uniforms.view,false,view.transform.inverse.matrix)
        gl.uniformMatrix4fv(uniforms.projection,false,view.projectionMatrix)
        for(const piece of pieces) {
          gl.bindTexture(gl.TEXTURE_2D,piece.texture)
          gl.uniform4f(uniforms.rect,piece.x,piece.y,piece.width,piece.height)
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
        }
      }
    }
    session.requestAnimationFrame(frame)
  } catch(error) {
    if (!ended) {await session.end().catch(()=>{});throw error}
  } finally {
    if(!gl) cleanup()
  }
}
