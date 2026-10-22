# Corrección de autoría y certificados

## 1. Migración
`supabase/migrations/20261029_artwork_artist_profile.sql`, después de `20261028_certificates.sql`.
Añade `artworks.artist_profile_id uuid` nullable, FK `artworks_artist_profile_id_fkey` → `profiles.id` (`ON DELETE SET NULL`) e índice `artworks_artist_profile_id_idx`.
No crea `artists`, `artworks.artist text`, nuevos campos de perfil ni permisos/roles. No contiene UPDATE masivo de autoría.

## 2. Identidad y cantidad de obras
**No identificadas con datos reales:** el entorno de revisión no tiene acceso autorizado a producción.
No asumir un perfil por nombre, rol, dueño o correo del desarrollador. Ejecutar `scripts/audit-artwork-artists.sql` en el editor SQL y revisar los resultados en privado. Reportar ID del perfil confirmado y lista/conteo antes de cualquier UPDATE. Obras sin evidencia de autoría requieren confirmación explícita; no se consideran automáticamente de Josué.

## 3. Backfill
Usa `*, artist_profile:profiles!artworks_artist_profile_id_fkey(full_name)` y páginas ordenadas de 500 filas. El wildcard conserva campos opcionales y evita exigir `artist`, `medium`, `edition` o imágenes inexistentes.
Normaliza la relación antes del snapshot; artista vinculado sin nombre falla explícitamente. Dry-run solo GET, imprime `[dry-run]`, artista y resumen. No se ejecutó `--apply`.

## 4. canonicalize / buildSnapshot
`normalizeArtworkForCertificate` obtiene `profiles.full_name` mediante la relación explícita. `buildSnapshot` también protege llamadas directas y copia el texto, sin guardar referencias al perfil. Sin relación, admite null por compatibilidad. No cambia el orden, versión ni algoritmo del hash. Certificados existentes nunca se recalculan.

## 5. Nuevas emisiones
La emisión usa la misma lectura/normalización. RPC `issue_certificate` vuelve a validar el nombre del perfil, bloqueándolo en la misma transacción que la obra. Si cambió el nombre entre lectura y emisión, devuelve `snapshot_stale`; si falta, `artist_profile_name_missing`. Backfill RPC también valida el artista. Certificados ya emitidos conservan snapshot e idempotencia.

## 6. Dry-run
La prueba automatizada ejecuta el script completo contra un servidor de prueba local sin columna `artworks.artist`, verifica nombre resuelto, cero escrituras y resumen `detected: 1, apply: false, created: 0, existing: 0, failed: 0`.
**Dry-run de producción pendiente:** aplicar la migración, revisar/asociar autoría solo tras reporte confirmado y ejecutar:

```powershell
git pull
node scripts/backfill-certificates.mjs
```

Usar Node 24 LTS y las variables de conexión privadas ya configuradas. No usar `--apply`. Un dry-run exitoso con artistas null no demuestra que la asociación de autoría esté terminada.