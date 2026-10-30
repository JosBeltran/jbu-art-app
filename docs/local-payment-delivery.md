# Pago contra entrega local — informe de implementación

## Estado de entrega
Implementado en `review/local-payment-delivery`, deshabilitado inicialmente. Main y producción intactas. No se han aplicado migraciones ni creado eventos/invitaciones/pedidos reales. No afirmar activación, persistencia de producción ni prueba end-to-end real antes de completar los pasos finales.

## Reutilizado
- `orders`, `order_items`, `artworks`, `profiles`, Auth email/Google y `user_roles`.
- `site_settings`, carrito, BuyButton, CartDrawer y retorno de acceso existentes.
- Carbon/IBM Plex y estilos con tokens; ES/EN, claro/oscuro.
- `notifications`, `enqueue_notification`, cola leased Resend y sus claves idempotentes.
- XP mediante trigger auditado PAYMENT_RECEIVED, reclamación/COA y recordArtworkSold. La venta no asigna automáticamente propietario ni emite certificado: crea el token para el proceso existente, igual que Stripe.
- Stripe checkout, firma webhook, promociones y contratos de ofertas/ganadores existentes. Se sustituye solo el fulfillment legacy no atómico por RPC transaccional compartido.

## Añadido
- `site_settings.local_delivery`: habilitación, municipios, estado, zona, horarios, anticipación y duración configurables.
- `artworks.delivery_category` nullable (`standard`/`large`) y `reserved_order_id` FK a orders; nunca se clasifica automáticamente ninguna obra.
- Campos orders: buyer_user_id, payment_method, payment_status, paid_at, local_delivery_key; category/start/end/timezone/revision/locale; event ID/link/sync status/last synced/error y lease privados.
- Única tabla nueva `order_delivery_events`: historial, notas solo Admin, grants/RLS; no otro sistema de pedidos/inventario/notificaciones.
- Modal Carbon `PaymentDelivery`, controles `AdminDeliverySettings`, `AdminDeliveryOrder`, resumen `OrderDeliverySummary`.
- `/api/local-delivery` GET config y POST QUOTE/CREATE; `/api/admin/local-delivery` GET/PUT; `/api/admin/orders/[id]/delivery` POST acciones/SLOTS/RETRY; `/api/admin/orders/[id]` PATCH operativo seguro para Stripe.

## Reglas y estados
- Pago: stripe / payment_on_delivery. Local inicia PENDING, entregado PAID y cancelado CANCELLED.
- Orden: PENDING_CONFIRMATION → CONFIRMED → SHIPPED (En camino) → DELIVERED; cancelación preentrega CANCELLED. La programación solicitada existe desde creación, sin confundirla con confirmación.
- Obra: AVAILABLE → RESERVED con orden asociada → SOLD solo tras cobro; cancelación libera exclusivamente su reserva. Ownership no cambia al reservar.
- Cuenta y correo confirmado requeridos únicamente para local; Stripe conserva su comportamiento de acceso. Dirección/día/selección se conservan en sessionStorage temporal durante retorno a login; no crea otro Auth.
- Standard mínimo 3 horas; large siguiente día local (no 24 h); mixto usa large. Ventanas 120 min dentro de 10:00–22:00 America/Monterrey. SQL vuelve a validar con reloj del servidor y clasificación bloqueada.
- Municipio normalizado (acentos, whitespace y alias San Nicolás/San Pedro/Escobedo) desde configuración. Estado Nuevo León, país MX, los nueve municipios del brief. Sin tarifa/transportista/capacidad/festivos/PIN/WhatsApp ni otras ampliaciones.

## Atomicidad y seguridad
RPC bloquea obras por ID estable y crea orden+items+reserva en una transacción. Clave UUID por comprador y advisory lock evitan doble envío; clave de Stripe y unique session existentes evitan repetición. Direct claims y actualizaciones no pueden sobrescribir reserva extranjera. Conflicto pagado Stripe devuelve 500/reconciliación, nunca falsa venta ni refund automático. Admin usa Auth real y user_roles en servidor; browser ya no puede escribir órdenes/items. Se retira política artworks UPDATE true y políticas items por profiles.role.
`complete_order_originals` es núcleo compartido para local, Stripe normal/Buy Now y RPC pendiente de ofertas/ganadores. Conserva tokens, snapshots de precio, XP y aprobación COA. No se limpia la anomalía archivada RESERVED sin orden.

## Calendar real
Conector del estudio ya vinculado y lectura owner verificada en Lovable. Sin OAuth del cliente ni aplicación OAuth propia. Servidor Vercel debe tener LOVABLE_API_KEY y GOOGLE_CALENDAR_API_KEY (privadas, nunca NEXT_PUBLIC), JBU_DELIVERY_CALENDAR_ID opcional (primary). Usar variables seguras del despliegue autorizado, nunca copiar secretos al repositorio. No puedo configurarlas ni verificarlas en Vercel desde esta conversación.
Scopes: gestión de eventos del calendario (calendar.events; conexión actual confirmada). No hay pasos Google Cloud Console adicionales al reutilizar conector administrado; no crear OAuth manual.
Evento private, dirección/referencias de entrega y comprador invitado; nunca notas internas. ID Google determinista jbu+UUID sin guiones (base32hex válido). GET/POST/PATCH/DELETE oficial con sendUpdates=all; DELIVERED conserva evento y no avisa innecesariamente. ETag y revisión evitan actualización vieja; lease SQL serializa reintentos. Error/timeout conserva pedido y FAILED; Admin RETRY sobre mismo ID, cancelación DELETE idempotente. SYNCED significa Google aceptó solicitud de invitación, no confirma recepción final en buzón.

## Migraciones y orden seguro de activación
1. Ventana de mantenimiento para endpoints de compra/edición de pedidos: coordinar esquema + código porque se revocan escrituras browser y el webhook nuevo requiere RPC.
2. Ejecutar `20261108_local_delivery_status.sql` y COMMIT separado (Postgres requiere confirmar enums antes de usarlos).
3. Ejecutar `20261109_local_payment_delivery.sql`, luego `20261110_atomic_stripe_fulfillment.sql` y `20261111_shared_pending_sale_core.sql`. Requieren esquema/notificaciones/roles auditados existentes. No reaplicar migraciones históricas.
4. Fusionar rama aprobada y nuevo deployment Vercel, no Redeploy de un commit anterior. Revisar webhook Stripe y errores antes de abrir compras.
5. Configurar variables privadas Calendar y comprobar con pedido de prueba autorizado. No enviar invitación a un correo elegido por el agente.
6. Clasificar standard/large por obra en Admin → Editar obra. Las 77 obras siguen sin clasificación inicial; no se modifica contenido automáticamente.
7. Configurar/habilitar entrega en Admin → Portada. Servidor impide habilitar con originales disponibles sin categoría.
8. Abrir compras tras pruebas reais Admin/comprador/Stripe/Resend/Calendar.

## Pruebas y límites de verificación
- Pruebas node:test de reglas concretas, integración PostgreSQL local PGlite con esquema auditado, permisos, cancelación/entrega duplicada, carreras, rollback, conflictos Stripe, prints y continuidad ofertas. Pruebas de Calendar con transportes simulados: creación/retry/reschedule/cancel/fallo/revisión.
- Comprobación visual aislada con los componentes reales Carbon en 1280 y 390 px: dirección/horario/revisión visibles, sin errores de ejecución. No equivale a checkout autenticado de producción.
- Tipos verificados con tsgo. No se ejecutó build Next completo; Vercel debe confirmarlo.
- Pendiente fuera del alcance accesible: aplicar SQL, acceso Vercel, clasificación de obras y prueba completa con cuentas reales e invitación Calendar recibida. Main no se toca sin aprobación.

## Aceptación manual final
Comprador Monterrey/San Nicolás/Guadalupe: ambas opciones; CDMX/internacional: solo Stripe sin registro extra. Standard mañana/tarde y large 23:50; browser otra zona; checkout antiguo revalida. Crear pedido muestra pendiente sin certificados; segundo comprador rechazado. Confirmar/reprogramar mismo evento; en camino; entregar/cobrar una vez (XP y tokens una vez); cancelar solo preentrega. Desactivar Calendar prueba FAILED y RETRY sin duplicados. Ver pedido en colección y confirmar que notas internas no salen. Finalmente compra Stripe normal, Buy Now, ganador/oferta y correo/COA existentes.
