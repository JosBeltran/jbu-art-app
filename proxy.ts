import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()

  // 1. Redirigir usuarios logueados lejos de /login y /signup
  if ((url.pathname === '/login' || url.pathname === '/signup') && user) {
    const requestedNext = url.searchParams.get('redirect') || url.searchParams.get('next')
    const destination = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/profile'
    const destinationUrl = new URL(destination, request.url)
    url.pathname = destinationUrl.pathname
    url.search = destinationUrl.search
    return NextResponse.redirect(url)
  }

  // 2. Proteger la ruta de colección privada
  if (url.pathname.startsWith('/collection') && !user) {
    url.pathname = '/login'
    url.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(url)
  }

  // 3. Proteger las rutas de /admin (Sesión + Rol en BD)
// 🛰️ LOG DE SESIÓN: Muestra si el servidor leyó la cookie
  console.log(`[PROXY AUTH] 👤 Usuario detectado en servidor: ${user ? user.email : 'NINGUNO (Cookie no leída)'}`)

  // Proteger la ruta de /admin
  if (url.pathname.startsWith('/admin')) {
    console.log('[PROXY ADMIN] 🔒 Evaluando acceso a /admin...')
    
    if (!user) {
      console.log('[PROXY ADMIN] ⚠️ No hay usuario en la cookie. Cediendo paso al cliente...')
      return response
    }

  // En proxy.ts dentro del bloque /admin:
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('*') // Traemos todo el objeto para inspeccionarlo
  .eq('id', user.id)
  .maybeSingle()

console.log('[PROXY ADMIN] 🔍 Objeto perfil completo desde BD:', profile)
console.log('[PROXY ADMIN] ❌ Error de BD (si existe):', profileError)
    if (profile && profile.role !== 'admin' && profile.role !== 'ADMINISTRADOR') {
      console.log('[PROXY ADMIN] 🚫 Rol insuficiente. Redirigiendo a /collection...')
      url.pathname = '/collection'
      return NextResponse.redirect(url)
    }

    console.log('[PROXY ADMIN] ✅ Acceso AUTORIZADO en el servidor')
  }

  return response
}

export default proxy

// Agregamos '/admin/:path*' al matcher para que evalúe también el panel admin
export const config = {
  matcher: ['/collection/:path*', '/login', '/signup', '/reset-password', '/admin/:path*'],
}