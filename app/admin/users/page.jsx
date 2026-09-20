'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function AdminUsersPage() {
  const router = useRouter()
 

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

  // Visibilidad de contraseñas
  const [showNewUserPassword, setShowNewUserPassword] = useState(false)
  const [showEditUserPassword, setShowEditUserPassword] = useState(false)

  // Formularios
  const [newUser, setNewUser] = useState({ 
    firstName: '', 
    lastName: '', 
    email: '', 
    password: '', 
    role: 'collector', 
    tierLevel: 'Entusiasta' 
  })
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

 const fetchUsers = async () => {
  setLoading(true)


  // 3. Cargar la lista completa de perfiles para el panel
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (profilesError) {
    setErrorMsg('Error al cargar la lista de usuarios: ' + profilesError.message)
  } else {
    setUsers(profilesData)
  }

  setLoading(false)
}

  useEffect(() => {
    fetchUsers()
  }, [router, supabase])

  const handleUpdateUserField = async (userId, field, value) => {
    setErrorMsg('')
    setSuccessMsg('')

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId)

    if (error) {
      setErrorMsg(`Error al actualizar usuario: ${error.message}`)
    } else {
      setSuccessMsg('¡Perfil actualizado correctamente!')
      setUsers(users.map(u => u.id === userId ? { ...u, [field]: value } : u))
      setTimeout(() => setSuccessMsg(''), 3000)
    }
  }

const handleCreateUser = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_USER',
          email: newUser.email,
          password: newUser.password,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          tierLevel: newUser.tierLevel
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMsg('¡Usuario registrado exitosamente!')
      setShowCreateModal(false)
      
      // Insertar inmediatamente al inicio de la lista local y limpiar buscador
      setSearchTerm('')
      if (data.user) {
        setUsers(prevUsers => [data.user, ...prevUsers])
      }

      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: 'collector', tierLevel: 'Entusiasta' })
      setShowNewUserPassword(false)
      
      // Re-consultar base de datos para sincronía total
      await fetchUsers()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ACCIÓN: Cambiar Contraseña
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CHANGE_PASSWORD',
          userId: selectedUser.id,
          password: newPassword
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMsg(`Contraseña actualizada para ${selectedUser.email}`)
      setShowPasswordModal(false)
      setNewPassword('')
      setShowEditUserPassword(false)
      setSelectedUser(null)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ACCIÓN: Bloquear / Suspender Usuario
  const handleToggleBan = async (user) => {
    const nextBanStatus = !user.is_banned
    const confirmAction = confirm(
      nextBanStatus 
        ? `¿Estás seguro de suspender a ${user.email}? El usuario no podrá iniciar sesión.`
        : `¿Reactivar acceso a ${user.email}?`
    )

    if (!confirmAction) return

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TOGGLE_BAN',
          userId: user.id,
          isBanned: nextBanStatus
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMsg(nextBanStatus ? 'Usuario suspendido' : 'Usuario reactivado')
      setUsers(users.map(u => u.id === user.id ? { ...u, is_banned: nextBanStatus } : u))
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-violet-950 flex items-center justify-center text-xs font-mono text-violet-500">
        Cargando directorio de coleccionistas y accesos...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-violet-950 text-violet-100 font-sans p-6 sm:p-12">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ENCABEZADO Y BUSCADOR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-violet-800 pb-6 gap-4">
          <div>
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
              Panel Administrativo — Estudio JBU
            </p>
            <h1 className="text-2xl font-serif font-light text-white">
              Gestión Avanzada de Usuarios y Accesos
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-violet-900 border border-violet-800 rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-violet-500 focus:outline-none focus:border-amber-500/50"
            />

            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-violet-950 px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center space-x-2"
            >
              <span>+</span>
              <span>Nuevo Usuario</span>
            </button>
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
        <div className="bg-violet-900/40 border border-violet-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-violet-800 bg-violet-950/60 text-[10px] font-mono text-violet-400 uppercase tracking-wider">
                  <th className="p-4">Usuario / Email</th>
                  <th className="p-4">Rol</th>
                  <th className="p-4">Nivel (Tier)</th>
                  <th className="p-4 text-center">Bóveda</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones de Cuenta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-800/60 text-xs font-mono">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className={`hover:bg-violet-900/60 transition ${u.is_banned ? 'bg-red-950/10' : ''}`}>
                    
                    <td className="p-4 space-y-0.5">
                      <p className="font-serif font-medium text-sm text-white">
                        {u.full_name || 'Sin Nombre Asignado'}
                      </p>
                      <p className="text-[11px] text-violet-400">{u.email}</p>
                    </td>

                    <td className="p-4">
                      <select
                        value={u.role || 'collector'}
                        onChange={(e) => handleUpdateUserField(u.id, 'role', e.target.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none transition ${
                          u.role === 'admin' 
                            ? 'bg-amber-950/80 text-amber-400 border-amber-500/40' 
                            : 'bg-violet-950 text-violet-300 border-violet-800'
                        }`}
                      >
                        <option value="collector">Coleccionista</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>

                    <td className="p-4">
                      <select
                        value={u.tier_level || 'Entusiasta'}
                        onChange={(e) => handleUpdateUserField(u.id, 'tier_level', e.target.value)}
                        className="bg-violet-950 text-violet-300 border border-violet-800 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:border-amber-500 transition"
                      >
                        <option value="Entusiasta">Entusiasta</option>
                        <option value="Coleccionista">Coleccionista</option>
                        <option value="Patrono">Patrono</option>
                        <option value="Embajador">Embajador</option>
                      </select>
                    </td>

                    <td className="p-4 text-center">
                      <span className="inline-block px-3 py-1 bg-violet-950 border border-violet-800 rounded-full text-amber-400 font-bold">
                        {u.artworks_count}
                      </span>
                    </td>

                    <td className="p-4">
                      {u.is_banned ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/30">
                          SUSPENDIDO
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                          ACTIVO
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => { setSelectedUser(u); setShowPasswordModal(true); }}
                        className="px-2.5 py-1.5 rounded-lg bg-violet-900 border border-violet-800 hover:border-amber-500/50 text-violet-300 hover:text-amber-400 transition"
                        title="Cambiar Contraseña"
                      >
                        🔑 Contraseña
                      </button>

                      <button
                        onClick={() => handleToggleBan(u)}
                        className={`px-2.5 py-1.5 rounded-lg border transition ${
                          u.is_banned 
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60' 
                            : 'bg-red-950/40 border-red-500/40 text-red-300 hover:bg-red-900/60'
                        }`}
                      >
                        {u.is_banned ? 'Reactivar' : 'Bloquear'}
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL: CREAR USUARIO (CON CAMPOS SEPARADOS Y REVEAL DE CONTRASEÑA) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-violet-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-violet-900 border border-violet-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-serif text-white">Registrar Nuevo Usuario</h3>
            
            <form onSubmit={handleCreateUser} className="space-y-3 font-mono text-xs">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-violet-400 mb-1">Nombre(s)</label>
                  <input
                    type="text"
                    required
                    value={newUser.firstName}
                    onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="Ej. Ana"
                  />
                </div>
                <div>
                  <label className="block text-violet-400 mb-1">Apellido(s)</label>
                  <input
                    type="text"
                    required
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="Ej. Martínez"
                  />
                </div>
              </div>

              <div>
                <label className="block text-violet-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500/50"
                  placeholder="usuario@ejemplo.com"
                />
              </div>

              <div>
                <label className="block text-violet-400 mb-1">Contraseña Inicial</label>
                <div className="relative">
                  <input
                    type={showNewUserPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 pr-10 text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 hover:text-amber-400 transition"
                    title={showNewUserPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showNewUserPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-violet-400 mb-1">Rol Inicial</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 text-white focus:outline-none"
                  >
                    <option value="collector">Coleccionista</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-violet-400 mb-1">Nivel Tier</label>
                  <select
                    value={newUser.tierLevel}
                    onChange={(e) => setNewUser({ ...newUser, tierLevel: e.target.value })}
                    className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 text-white focus:outline-none"
                  >
                    <option value="Entusiasta">Entusiasta</option>
                    <option value="Coleccionista">Coleccionista</option>
                    <option value="Patrono">Patrono</option>
                    <option value="Embajador">Embajador</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-violet-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-violet-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 text-violet-950 font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {submitting ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR CONTRASEÑA (CON REVEAL DE CONTRASEÑA) */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-violet-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-violet-900 border border-violet-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-serif text-white">Cambiar Contraseña</h3>
            <p className="text-xs font-mono text-violet-400">
              Cambiando credenciales para: <span className="text-amber-400">{selectedUser.email}</span>
            </p>

            <form onSubmit={handleChangePassword} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-violet-400 mb-1">Nueva Contraseña</label>
                <div className="relative">
                  <input
                    type={showEditUserPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-violet-950 border border-violet-800 rounded-xl p-2.5 pr-10 text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditUserPassword(!showEditUserPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 hover:text-amber-400 transition"
                    title={showEditUserPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showEditUserPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-violet-800">
                <button
                  type="button"
                  onClick={() => { setShowPasswordModal(false); setSelectedUser(null); }}
                  className="px-4 py-2 rounded-xl text-violet-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 text-violet-950 font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {submitting ? 'Actualizando...' : 'Actualizar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}