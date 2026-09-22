'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Button,
  Tag,
  Search,
  Select,
  SelectItem,
  TextInput,
  PasswordInput,
  Modal,
  InlineNotification,
  InlineLoading,
  Pagination,
  DataTableSkeleton,
} from '@carbon/react'
import { Add, Password, Locked, Unlocked } from '@carbon/icons-react'
import styles from './Users.module.css'

const PAGE_SIZE = 15

export default function AdminUsersPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [page, setPage] = useState(1)

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

  // Formularios
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'collector',
    tierLevel: 'Entusiasta',
  })
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)

    // Cargar la lista completa de perfiles para el panel
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (profilesError) {
      setErrorMsg('Error al cargar la lista de usuarios: ' + profilesError.message)
    } else {
      // DataTable de Carbon requiere que el id sea string
      setUsers((profilesData || []).map((u) => ({ ...u, id: u.id.toString() })))
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
      setUsers(users.map((u) => (u.id === userId ? { ...u, [field]: value } : u)))
      setTimeout(() => setSuccessMsg(''), 3000)
    }
  }

  const handleCreateUser = async (e) => {
    e?.preventDefault?.()
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
          tierLevel: newUser.tierLevel,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMsg('¡Usuario registrado exitosamente!')
      setShowCreateModal(false)

      // Insertar inmediatamente al inicio de la lista local y limpiar buscador
      setSearchTerm('')
      if (data.user) {
        setUsers((prevUsers) => [{ ...data.user, id: data.user.id.toString() }, ...prevUsers])
      }

      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: 'collector', tierLevel: 'Entusiasta' })

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
    e?.preventDefault?.()
    setSubmitting(true)
    setErrorMsg('')

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CHANGE_PASSWORD',
          userId: selectedUser.id,
          password: newPassword,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMsg(`Contraseña actualizada para ${selectedUser.email}`)
      setShowPasswordModal(false)
      setNewPassword('')
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
          isBanned: nextBanStatus,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMsg(nextBanStatus ? 'Usuario suspendido' : 'Usuario reactivado')
      setUsers(users.map((u) => (u.id === user.id ? { ...u, is_banned: nextBanStatus } : u)))
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const headers = [
    { key: 'user', header: 'Usuario / Email' },
    { key: 'role', header: 'Rol' },
    { key: 'tier', header: 'Nivel (Tier)' },
    { key: 'artworks', header: 'Bóveda' },
    { key: 'status', header: 'Estado' },
    { key: 'actions', header: 'Acciones de Cuenta' },
  ]

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.inner}>
          <DataTableSkeleton
            columnCount={headers.length}
            rowCount={6}
            showHeader
            showToolbar
            headers={headers}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>

        {/* ENCABEZADO Y BUSCADOR */}
        <div className={styles.header}>
          <div>
            <span className={styles.kicker}>Panel Administrativo — Estudio JBU</span>
            <h1 className={styles.title}>Gestión de Usuarios y Accesos</h1>
          </div>

          <div className={styles.headerActions}>
            <Tag type="purple" size="md">
              {users.length} {users.length === 1 ? 'Usuario' : 'Usuarios'}
            </Tag>

            <Search
              size="md"
              labelText="Buscar usuario"
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
              className={styles.search}
            />

            <Button renderIcon={Add} size="md" onClick={() => setShowCreateModal(true)}>
              Nuevo Usuario
            </Button>
          </div>
        </div>

        {/* MENSAJES DE ESTADO */}
        {errorMsg && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={errorMsg}
            lowContrast
            onCloseButtonClick={() => setErrorMsg('')}
          />
        )}
        {successMsg && (
          <InlineNotification
            kind="success"
            title="Operación exitosa"
            subtitle={successMsg}
            lowContrast
            onCloseButtonClick={() => setSuccessMsg('')}
          />
        )}

        {/* TABLA DE USUARIOS */}
        <DataTable rows={pagedRows} headers={headers}>
          {({ rows, headers, getHeaderProps, getRowProps }) => (
            <TableContainer className={styles.tableContainer}>
              <Table size="lg" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => {
                      // La key va directa en el JSX, nunca dentro del spread
                      const { key: headerKey, ...headerProps } = getHeaderProps({ header })
                      return (
                        <TableHeader key={headerKey || header.key} {...headerProps}>
                          {header.header}
                        </TableHeader>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length}>
                        <div className={styles.empty}>
                          No hay usuarios registrados o que coincidan con la búsqueda.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const u = users.find((usr) => usr.id === row.id)
                      if (!u) return null

                      // La key de la fila va directa en el JSX, nunca dentro del spread
                      const { key: rowKey, ...rowProps } = getRowProps({ row })

                      return (
                        <TableRow key={rowKey || row.id} {...rowProps}>

                          {/* Usuario / Email */}
                          <TableCell>
                            <p className={styles.userName}>{u.full_name || 'Sin Nombre Asignado'}</p>
                            <p className={styles.userEmail}>{u.email}</p>
                          </TableCell>

                          {/* Rol */}
                          <TableCell>
                            <Select
                              id={`role-${u.id}`}
                              labelText="Rol"
                              hideLabel
                              size="sm"
                              className={styles.inlineSelect}
                              value={u.role || 'collector'}
                              onChange={(e) => handleUpdateUserField(u.id, 'role', e.target.value)}
                            >
                              <SelectItem value="collector" text="Coleccionista" />
                              <SelectItem value="admin" text="Administrador" />
                            </Select>
                          </TableCell>

                          {/* Nivel (Tier) */}
                          <TableCell>
                            <Select
                              id={`tier-${u.id}`}
                              labelText="Nivel"
                              hideLabel
                              size="sm"
                              className={styles.inlineSelect}
                              value={u.tier_level || 'Entusiasta'}
                              onChange={(e) => handleUpdateUserField(u.id, 'tier_level', e.target.value)}
                            >
                              <SelectItem value="Entusiasta" text="Entusiasta" />
                              <SelectItem value="Coleccionista" text="Coleccionista" />
                              <SelectItem value="Patrono" text="Patrono" />
                              <SelectItem value="Embajador" text="Embajador" />
                            </Select>
                          </TableCell>

                          {/* Bóveda */}
                          <TableCell>
                            <span className={styles.count}>{u.artworks_count ?? 0}</span>
                          </TableCell>

                          {/* Estado */}
                          <TableCell>
                            <Tag type={u.is_banned ? 'red' : 'green'} size="sm">
                              {u.is_banned ? 'Suspendido' : 'Activo'}
                            </Tag>
                          </TableCell>

                          {/* Acciones */}
                          <TableCell>
                            <div className={styles.rowActions}>
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Password}
                                hasIconOnly
                                iconDescription="Cambiar contraseña"
                                onClick={() => { setSelectedUser(u); setShowPasswordModal(true) }}
                              />
                              <Button
                                kind={u.is_banned ? 'tertiary' : 'danger--ghost'}
                                size="sm"
                                renderIcon={u.is_banned ? Unlocked : Locked}
                                hasIconOnly
                                iconDescription={u.is_banned ? 'Reactivar usuario' : 'Suspender usuario'}
                                onClick={() => handleToggleBan(u)}
                              />
                            </div>
                          </TableCell>

                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>

        {filteredUsers.length > PAGE_SIZE && (
          <Pagination
            page={currentPage}
            pageSize={PAGE_SIZE}
            pageSizes={[PAGE_SIZE]}
            totalItems={filteredUsers.length}
            onChange={({ page: nextPage }) => setPage(nextPage)}
            pagesUnknown={false}
            backwardText="Página anterior"
            forwardText="Página siguiente"
            itemsPerPageText="Usuarios por página"
            pageNumberText="Página"
          />
        )}

      </div>

      {/* MODAL: CREAR USUARIO */}
      <Modal
        open={showCreateModal}
        modalHeading="Registrar Nuevo Usuario"
        primaryButtonText={submitting ? 'Creando...' : 'Crear Usuario'}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={submitting}
        onRequestClose={() => setShowCreateModal(false)}
        onRequestSubmit={handleCreateUser}
      >
        <div className={styles.modalForm}>
          <div className={styles.modalGrid}>
            <TextInput
              id="new-user-firstname"
              labelText="Nombre(s)"
              placeholder="Ej. Ana"
              required
              value={newUser.firstName}
              onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
            />
            <TextInput
              id="new-user-lastname"
              labelText="Apellido(s)"
              placeholder="Ej. Martínez"
              required
              value={newUser.lastName}
              onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
            />
          </div>

          <TextInput
            id="new-user-email"
            type="email"
            labelText="Correo Electrónico"
            placeholder="usuario@ejemplo.com"
            required
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          />

          <PasswordInput
            id="new-user-password"
            labelText="Contraseña Inicial"
            placeholder="Mínimo 6 caracteres"
            required
            minLength={6}
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            showPasswordLabel="Mostrar contraseña"
            hidePasswordLabel="Ocultar contraseña"
          />

          <div className={styles.modalGrid}>
            <Select
              id="new-user-role"
              labelText="Rol Inicial"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <SelectItem value="collector" text="Coleccionista" />
              <SelectItem value="admin" text="Administrador" />
            </Select>

            <Select
              id="new-user-tier"
              labelText="Nivel Tier"
              value={newUser.tierLevel}
              onChange={(e) => setNewUser({ ...newUser, tierLevel: e.target.value })}
            >
              <SelectItem value="Entusiasta" text="Entusiasta" />
              <SelectItem value="Coleccionista" text="Coleccionista" />
              <SelectItem value="Patrono" text="Patrono" />
              <SelectItem value="Embajador" text="Embajador" />
            </Select>
          </div>

          {submitting && <InlineLoading description="Creando usuario..." />}
        </div>
      </Modal>

      {/* MODAL: CAMBIAR CONTRASEÑA */}
      <Modal
        open={showPasswordModal && !!selectedUser}
        modalHeading="Cambiar Contraseña"
        primaryButtonText={submitting ? 'Actualizando...' : 'Actualizar Contraseña'}
        secondaryButtonText="Cancelar"
        primaryButtonDisabled={submitting}
        onRequestClose={() => { setShowPasswordModal(false); setSelectedUser(null) }}
        onRequestSubmit={handleChangePassword}
      >
        {selectedUser && (
          <div className={styles.modalForm}>
            <p className={styles.modalHint}>
              Cambiando credenciales para: <strong>{selectedUser.email}</strong>
            </p>

            <PasswordInput
              id="edit-user-password"
              labelText="Nueva Contraseña"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              showPasswordLabel="Mostrar contraseña"
              hidePasswordLabel="Ocultar contraseña"
            />

            {submitting && <InlineLoading description="Actualizando contraseña..." />}
          </div>
        )}
      </Modal>

    </div>
  )
}
