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
import { useI18n } from '@/components/I18nProvider'

const PAGE_SIZE = 15

export default function AdminUsersPage() {
  const router = useRouter()
  const { t } = useI18n()

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
      setErrorMsg(t('Error al cargar la lista de usuarios: ', 'Error loading user list: ') + profilesError.message)
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
      setSuccessMsg(t('¡Perfil actualizado correctamente!', 'Profile updated successfully!'))
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

      setSuccessMsg(t('¡Usuario registrado exitosamente!', 'User registered successfully!'))
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
        ? t(`¿Estás seguro de suspender a ${user.email}? El usuario no podrá iniciar sesión.`, `Are you sure you want to suspend ${user.email}? The user will not be able to log in.`)
        : t(`¿Reactivar acceso a ${user.email}?`, `Reactivate access for ${user.email}?`)
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

      setSuccessMsg(nextBanStatus ? t('Usuario suspendido', 'User suspended') : t('Usuario reactivado', 'User reactivated'))
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
    { key: 'user', header: t('Usuario / Email', 'User / Email') },
    { key: 'role', header: t('Rol', 'Role') },
    { key: 'tier', header: t('Nivel (Tier)', 'Tier Level') },
    { key: 'artworks', header: t('Bóveda', 'Vault') },
    { key: 'status', header: t('Estado', 'Status') },
    { key: 'actions', header: t('Acciones de Cuenta', 'Account Actions') },
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
            <span className={styles.kicker}>{t('Panel Administrativo — Estudio JBU', 'Admin Panel — Estudio JBU')}</span>
            <h1 className={styles.title}>{t('Gestión de Usuarios y Accesos', 'User & Access Management')}</h1>
          </div>

          <div className={styles.headerActions}>
            <Tag type="purple" size="md">
              {users.length} {users.length === 1 ? t('Usuario', 'User') : t('Usuarios', 'Users')}
            </Tag>

            <Search
              size="md"
              labelText={t('Buscar usuario', 'Search user')}
              placeholder={t('Buscar por nombre o correo...', 'Search by name or email...')}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
              className={styles.search}
            />

            <Button renderIcon={Add} size="md" onClick={() => setShowCreateModal(true)}>
              {t('Nuevo Usuario', 'New User')}
            </Button>
          </div>
        </div>

        {/* MENSAJES DE ESTADO */}
        {errorMsg && (
          <InlineNotification
            kind="error"
            title={t('Error', 'Error')}
            subtitle={errorMsg}
            lowContrast
            onCloseButtonClick={() => setErrorMsg('')}
          />
        )}
        {successMsg && (
          <InlineNotification
            kind="success"
            title={t('Operación exitosa', 'Success')}
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
                          {t('No hay usuarios registrados o que coincidan con la búsqueda.', 'No registered users match the search.')}
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
                            <p className={styles.userName}>{u.full_name || t('Sin Nombre Asignado', 'No Name Assigned')}</p>
                            <p className={styles.userEmail}>{u.email}</p>
                          </TableCell>

                          {/* Rol */}
                          <TableCell>
                            <Select
                              id={`role-${u.id}`}
                              labelText={t('Rol', 'Role')}
                              hideLabel
                              size="sm"
                              className={styles.inlineSelect}
                              value={u.role || 'collector'}
                              onChange={(e) => handleUpdateUserField(u.id, 'role', e.target.value)}
                            >
                              <SelectItem value="collector" text={t('Coleccionista', 'Collector')} />
                              <SelectItem value="admin" text={t('Administrador', 'Admin')} />
                            </Select>
                          </TableCell>

                          {/* Nivel (Tier) */}
                          <TableCell>
                            <Select
                              id={`tier-${u.id}`}
                              labelText={t('Nivel', 'Level')}
                              hideLabel
                              size="sm"
                              className={styles.inlineSelect}
                              value={u.tier_level || 'Entusiasta'}
                              onChange={(e) => handleUpdateUserField(u.id, 'tier_level', e.target.value)}
                            >
                              <SelectItem value="Entusiasta" text={t('Entusiasta', 'Enthusiast')} />
                              <SelectItem value="Coleccionista" text={t('Coleccionista', 'Collector')} />
                              <SelectItem value="Patrono" text={t('Patrono', 'Patron')} />
                              <SelectItem value="Embajador" text={t('Embajador', 'Ambassador')} />
                            </Select>
                          </TableCell>

                          {/* Bóveda */}
                          <TableCell>
                            <span className={styles.count}>{u.artworks_count ?? 0}</span>
                          </TableCell>

                          {/* Estado */}
                          <TableCell>
                            <Tag type={u.is_banned ? 'red' : 'green'} size="sm">
                              {u.is_banned ? t('Suspendido', 'Suspended') : t('Activo', 'Active')}
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
                                iconDescription={t('Cambiar contraseña', 'Change password')}
                                onClick={() => { setSelectedUser(u); setShowPasswordModal(true) }}
                              />
                              <Button
                                kind={u.is_banned ? 'tertiary' : 'danger--ghost'}
                                size="sm"
                                renderIcon={u.is_banned ? Unlocked : Locked}
                                hasIconOnly
                                iconDescription={u.is_banned ? t('Reactivar usuario', 'Reactivate user') : t('Suspender usuario', 'Suspend user')}
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
            backwardText={t('Página anterior', 'Previous page')}
            forwardText={t('Página siguiente', 'Next page')}
            itemsPerPageText={t('Usuarios por página', 'Users per page')}
            pageNumberText={t('Página', 'Page')}
          />
        )}

      </div>

      {/* MODAL: CREAR USUARIO */}
      <Modal
        open={showCreateModal}
        modalHeading={t('Registrar Nuevo Usuario', 'Register New User')}
        primaryButtonText={submitting ? t('Creando...', 'Creating...') : t('Crear Usuario', 'Create User')}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        primaryButtonDisabled={submitting}
        onRequestClose={() => setShowCreateModal(false)}
        onRequestSubmit={handleCreateUser}
      >
        <div className={styles.modalForm}>
          <div className={styles.modalGrid}>
            <TextInput
              id="new-user-firstname"
              labelText={t('Nombre(s)', 'First Name(s)')}
              placeholder={t('Ej. Ana', 'E.g. Ana')}
              required
              value={newUser.firstName}
              onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
            />
            <TextInput
              id="new-user-lastname"
              labelText={t('Apellido(s)', 'Last Name(s)')}
              placeholder={t('Ej. Martínez', 'E.g. Smith')}
              required
              value={newUser.lastName}
              onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
            />
          </div>

          <TextInput
            id="new-user-email"
            type="email"
            labelText={t('Correo Electrónico', 'Email')}
            placeholder={t('usuario@ejemplo.com', 'user@example.com')}
            required
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          />

          <PasswordInput
            id="new-user-password"
            labelText={t('Contraseña Inicial', 'Initial Password')}
            placeholder={t('Mínimo 6 caracteres', 'Minimum 6 characters')}
            required
            minLength={6}
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            showPasswordLabel={t('Mostrar contraseña', 'Show password')}
            hidePasswordLabel={t('Ocultar contraseña', 'Hide password')}
          />

          <div className={styles.modalGrid}>
            <Select
              id="new-user-role"
              labelText={t('Rol Inicial', 'Initial Role')}
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            >
              <SelectItem value="collector" text={t('Coleccionista', 'Collector')} />
              <SelectItem value="admin" text={t('Administrador', 'Admin')} />
            </Select>

            <Select
              id="new-user-tier"
              labelText={t('Nivel Tier', 'Tier Level')}
              value={newUser.tierLevel}
              onChange={(e) => setNewUser({ ...newUser, tierLevel: e.target.value })}
            >
              <SelectItem value="Entusiasta" text={t('Entusiasta', 'Enthusiast')} />
              <SelectItem value="Coleccionista" text={t('Coleccionista', 'Collector')} />
              <SelectItem value="Patrono" text={t('Patrono', 'Patron')} />
              <SelectItem value="Embajador" text={t('Embajador', 'Ambassador')} />
            </Select>
          </div>

          {submitting && <InlineLoading description={t('Creando usuario...', 'Creating user...')} />}
        </div>
      </Modal>

      {/* MODAL: CAMBIAR CONTRASEÑA */}
      <Modal
        open={showPasswordModal && !!selectedUser}
        modalHeading={t('Cambiar Contraseña', 'Change Password')}
        primaryButtonText={submitting ? t('Actualizando...', 'Updating...') : t('Actualizar Contraseña', 'Update Password')}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        primaryButtonDisabled={submitting}
        onRequestClose={() => { setShowPasswordModal(false); setSelectedUser(null) }}
        onRequestSubmit={handleChangePassword}
      >
        {selectedUser && (
          <div className={styles.modalForm}>
            <p className={styles.modalHint}>
              {t('Cambiando credenciales para: ', 'Changing credentials for: ')}<strong>{selectedUser.email}</strong>
            </p>

            <PasswordInput
              id="edit-user-password"
              labelText={t('Nueva Contraseña', 'New Password')}
              placeholder={t('Mínimo 6 caracteres', 'Minimum 6 characters')}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              showPasswordLabel={t('Mostrar contraseña', 'Show password')}
              hidePasswordLabel={t('Ocultar contraseña', 'Hide password')}
            />

            {submitting && <InlineLoading description={t('Actualizando contraseña...', 'Updating password...')} />}
          </div>
        )}
      </Modal>

    </div>
  )
}
