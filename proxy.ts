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

  // Proteger la ruta de colección privada
  if (url.pathname.startsWith('/collection') && !user) {
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirigir a usuarios logueados lejos de /login y /signup
  if ((url.pathname === '/login' || url.pathname === '/signup') && user) {
    url.pathname = '/collection'
    return NextResponse.redirect(url)
  }

  return response
}

// También exportamos como default por compatibilidad con la convención de Next.js
export default proxy

export const config = {
  matcher: ['/collection/:path*', '/login', '/signup'],
}