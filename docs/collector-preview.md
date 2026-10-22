# View as Collector / Ver como collector

## Entrega
- Ruta: `/admin/collectors/[profileId]/preview`, acción con icono de vista en `/admin/users`.
- Reutiliza `components/collection/CollectionView.jsx`, `CollectionRegistry.jsx`, `ArtworkImage`, Carbon, I18n y los estilos originales de Collection. `/collection` usa exactamente esa misma vista; se añade una pestaña compartida para certificados, reclamaciones, grupos y procedencia pública.
- Contrato compartido en `lib/collection/data.js`: filtros por titular/solicitante, email real de Auth para pedidos, favoritos propios y certificados por owner_id. Campos explícitos; sin tokens de reclamación, notas Admin, snapshots personales ni rutas privadas de PDF.
- `profileId` validado como UUID; resolución exacta `profiles.id == auth.users.id`, verificada con `getUserById`. No asociación por email/nombre. Diferencias de email y asociaciones inexistentes se reportan.
- Barra sticky ADMIN PREVIEW con collector, email enmascarado y salida. Sin reclamos, borrados de favoritos, transferencias o edición; los detalles de pedidos quedan deshabilitados para no abrir accidentalmente una experiencia bajo la identidad Admin. Los enlaces de verificación son públicos.

## Autorización
GET `/api/admin/collectors/[profileId]/preview` valida el bearer del Admin con `auth.getUser`, después consulta **user_roles** con ese mismo token por user_id y role=admin. No confía en profiles.role/users.role/email ni solo en el layout. Solo después crea cliente de servicio. Ausencia/error de roles separados deniega acceso (503), collector normal 403, sin sesión 401. Respuestas privadas no-store; no métodos de escritura.

**Activación pendiente:** El repo histórico no confirma tabla/grants/políticas user_roles en producción. No se migran roles ni se asigna Admin automáticamente. Antes de utilizar la herramienta, un operador debe confirmar roles separados legibles por su dueño y no editables por collectors. El layout Admin histórico también comprueba perfiles; esta entrega no cambia esa autorización global. Un Admin solo en roles separados podría necesitar corregir ese layout en una tarea autorizada aparte.

## Data Preview vs Permission Preview
Data Preview es explícitamente una lectura esperada con privilegios Admin: nunca demuestra RLS. Errores parciales se muestran, y los conteos de secciones fallidas no son conclusiones de ausencia. Permission Preview muestra **no verificado**, sin colecciones inventadas ni simulación con service_role. No se genera JWT, login, magic link o sesión ajena.

`scripts/audit-collector-permissions.sql` ofrece la comprobación viable sin login: transacción READ ONLY ejecutada por operador autorizado en SQL editor, baseline esperado, `SET LOCAL ROLE authenticated` y claims locales del auth user confirmado, consultas bajo grants/RLS reales, ROLLBACK. NO es SECURITY DEFINER (Postgres no permite SET ROLE dentro de él); no se expone como endpoint. Reemplazar TARGET_AUTH_USER_UUID en dos lugares con el mismo UUID real. Permite comparar conteos esperados/permisos, filas, grupos, grants/políticas y asociaciones. Si falta un permiso, el error es evidencia; ejecutar ROLLBACK al fallar. No modifica políticas ni datos. No reproduce custom app_metadata, bans de Auth ni políticas de descargas Storage: prueba SQL, no sesión end-to-end.

## Validación y límites
Pruebas de autorización, filtro de collector, fallo cerrado, ausencia de datos Admin, advertencias, solo lectura y distinción honesta entre esperado/verificado incluidas en `lib/collection/preview.test.js`. No se tuvo acceso autorizado al backend de producción ni a una sesión Admin de esa app para validar la colección real. Quedan pendientes activación de roles separados, auditoría SQL y prueba con Admin real. La pestaña Permission no afirma verificación automática.

## Hallazgo separado (no modificado)
`/api/admin/users` histórico expone acciones privilegiadas sin validar sesión/rol; endpoints de grupos también requieren revisión. Esta herramienta no los reutiliza ni agrega escrituras. Deben corregirse en una tarea de seguridad separada; no se declara seguro todo el panel existente.
