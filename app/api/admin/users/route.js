// app/api/admin/users/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(req) {
  try {
    const body = await req.json()
    const { action, userId, email, password, firstName, lastName, role, tierLevel, isBanned } = body

    if (action === 'CREATE_USER') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email y contraseña son obligatorios' }, { status: 400 })
      }

      const fullName = `${firstName || ''} ${lastName || ''}`.trim()

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { 
          full_name: fullName,
          first_name: firstName,
          last_name: lastName 
        }
      })

      if (authError) {
        if (authError.code === 'email_exists' || authError.status === 422) {
          return NextResponse.json({ error: 'El correo electrónico ya existe en Supabase Auth.' }, { status: 409 })
        }
        throw authError
      }

      // Upsert en public.profiles
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authData.user.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName || email,
          email: email,
          role: role || 'collector',
          tier_level: tierLevel || 'Entusiasta',
          is_banned: false
        })
        .select()
        .single()

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return NextResponse.json({ error: `Error al crear perfil público: ${profileError.message}` }, { status: 500 })
      }

      return NextResponse.json({ 
        success: true, 
        user: { ...profileData, artworks_count: 0 } 
      })
    }

    if (action === 'CHANGE_PASSWORD') {
      if (!userId || !password) {
        return NextResponse.json({ error: 'Faltan datos del usuario o contraseña' }, { status: 400 })
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'TOGGLE_BAN') {
      if (!userId) {
        return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 })
      }
      const banDuration = isBanned ? '876000h' : '0h'
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: banDuration })
      if (authError) throw authError

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ is_banned: isBanned })
        .eq('id', userId)

      if (profileError) throw profileError
      return NextResponse.json({ success: true, is_banned: isBanned })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })

  } catch (error) {
    console.error('Error en Admin Users API:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}