'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function AdminUsersPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    const verifyAdminAndFetchUsers = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profile || profile.role !== 'admin') {
        router.push('/collection')
        return
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (profilesError) {
        setErrorMsg('Error al cargar la lista de usuarios: ' + profilesError.message)
      } else {
        const usersWithArtworkCount = await Promise.all(
          profilesData.map(async (p) => {
            const { count } = await supabase
              .from('artworks')
              .select('*', { count: 'exact', head: true })
              .eq('current_owner_id', p.id)

            return {
              ...p,
              artworks_count: count || 0
            }
          })
        )
        setUsers(usersWithArtworkCount)
      }

      setLoading(false)
    }

    verifyAdminAndFetchUsers()
  }, [router, supabase])

  const handleUpdateUser = async (userId, field, value) => {
    setErrorMsg('')
    setSuccessMsg('')

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId)

    if (error) {
      setErrorMsg(`Error al actualizar usuario: ${error.message}`)
    } else {
      setSuccessMsg('¡Usuario actualizado correctamente!')
      setUsers(users.map(u => u.id === userId ? { ...u, [field]: value } : u))
      setTimeout(() => setSuccessMsg(''), 3000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-xs font-mono text-neutral-500">
        Cargando directorio de coleccionistas...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 sm:p-12">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ENCABEZADO LIMPIO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-800 pb-6 gap-4">
          <div>
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
              Panel Administrativo — Estudio JBU
            </p>
            <h1 className="text-2xl font-serif font-light text-white">
              Directorio de Coleccionistas y Accesos
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg">
              {users.length} {users.length === 1 ? 'Usuario Registrado' : 'Usuarios Registrados'}
            </span>
          </div>
        </div>

        {/* MENSAJES DE ESTADO */}
        {errorMsg && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-4 text-xs font-mono text-red-300">
            🚨 {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-4 text-xs font-mono text-emerald-300">
            ✨ {successMsg}
          </div>
        )}

        {/* TABLA DE USUARIOS */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/60 text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                  <th className="p-4">Coleccionista</th>
                  <th className="p-4">Rol en Sistema</th>
                  <th className="p-4">Nivel (Tier)</th>
                  <th className="p-4 text-center">Obras en Bóveda</th>
                  <th className="p-4">Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-xs font-mono">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-900/60 transition">
                    
                    <td className="p-4 space-y-0.5">
                      <p className="font-serif font-medium text-sm text-white">
                        {u.full_name || 'Sin Nombre Asignado'}
                      </p>
                      <p className="text-[11px] text-neutral-400">{u.email}</p>
                    </td>

                    <td className="p-4">
                      <select
                        value={u.role || 'collector'}
                        onChange={(e) => handleUpdateUser(u.id, 'role', e.target.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none transition ${
                          u.role === 'admin' 
                            ? 'bg-amber-950/80 text-amber-400 border-amber-500/40' 
                            : 'bg-neutral-950 text-neutral-300 border-neutral-800'
                        }`}
                      >
                        <option value="collector">Coleccionista</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>

                    <td className="p-4">
                      <select
                        value={u.tier_level || 'Entusiasta'}
                        onChange={(e) => handleUpdateUser(u.id, 'tier_level', e.target.value)}
                        className="bg-neutral-950 text-neutral-300 border border-neutral-800 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:border-amber-500 transition"
                      >
                        <option value="Entusiasta">Entusiasta (0 obras)</option>
                        <option value="Coleccionista">Coleccionista (1-2 obras)</option>
                        <option value="Patrono">Patrono (3-5 obras)</option>
                        <option value="Embajador">Embajador (6+ obras)</option>
                      </select>
                    </td>

                    <td className="p-4 text-center">
                      <span className="inline-block px-3 py-1 bg-neutral-950 border border-neutral-800 rounded-full text-amber-400 font-bold">
                        {u.artworks_count}
                      </span>
                    </td>

                    <td className="p-4 text-neutral-500 text-[11px]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}