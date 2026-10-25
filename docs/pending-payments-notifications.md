# Ofertas, subastas y notificaciones JBU

## Diagnóstico
Aceptar una oferta solo actualizaba su etiqueta, sin plazo ni pago autorizado. El bloque del ganador trataba cualquier estado no pagado como pagable, incluso tras vencer; el panel y la barra móvil mantenían estados diferentes. Las ofertas recibían userId del navegador y las decisiones Admin podían indicar éxito con cero filas.

## Reutilización
`lib/auctionCheckout.server.js` sigue construyendo Checkout. `PendingPayment` extrae el bloque existente del ganador, usando exactamente su módulo CSS Carbon. Ambos orígenes se resuelven mediante `lib/payments/pending.js`; precio desde oferta aceptada o puja ganadora, nunca desde navegador. No hay purchase opportunity, reserva ni nueva entidad de venta.

La finalización de pagos pendientes usa las tablas actuales de orders/order_items/artworks y una transacción para ambos orígenes. Cart/Buy Now conservan su flujo; el carrito no permite saltarse una oferta aceptada vigente. Las reclamaciones y certificados no se emiten ni modifican por aceptar ofertas.

## Actualización requerida
Antes de activar este cambio, ejecutar `scripts/audit-pending-payments.sql` (solo lectura) y revisar columnas, enums, restricciones, funciones y permisos reales. Aplicar después `supabase/migrations/20261102_pending_payments_notifications.sql`, que requiere tablas actuales y 20261031_user_roles. No activar el código sin la actualización: la comprobación de pagos falla cerrada si falta.

Las ofertas aceptadas históricas no obtienen un plazo nuevo automáticamente. Requieren revisión, sin edición masiva ni backfill. Checkout nuevo lleva pending_contract=v1 y vinculación de sesión; las sesiones anteriores conservan el webhook legacy para no impedir pagos ya iniciados. Revisar pagos en tránsito antes de activar. Parámetros e identificador de intento Stripe se persisten antes de llamar a Stripe para recuperar la misma sesión ante reintentos.

## Plazos y Stripe
El plazo predeterminado de ofertas es 72 horas, igual al valor existente de subastas. El servidor rechaza pagos vencidos y reusa sesiones abiertas. Stripe exige al menos 30 minutos para una nueva sesión; si queda menos y no hay una sesión abierta reutilizable, se rechaza el inicio de un nuevo checkout. Ninguna sesión creada puede durar más que el derecho de pago.

El momento de pago usa la fecha del evento Stripe verificado, no el momento de entrega del webhook: un pago completado dentro del plazo puede confirmarse aunque el aviso llegue después. Conflictos retornan error para revisión, sin crear órdenes incorrectas.

## Avisos
Campana Carbon en la cabecera y /notifications privado, ES/EN y temas existentes; lectura exclusiva del destinatario, marcar uno/todos leídos. Eventos de ofertas, pujas/superación, ganador, pendientes/vencimientos, órdenes y PDF del certificado. No se fabrican estados operativos.

Aceptación/rechazo envía correo por el remitente Resend existente. Cola con lease e idempotency key: errores quedan pendientes, no se afirma entrega. El mismo PATCH de decisión reintenta el correo sin duplicar la aceptación. `POST /api/admin/notifications`, con Admin real en user_roles, permite reintentar la cola. Para reintentos automáticos configurar un trabajo autenticado; no hay endpoint público privilegiado. Cron de vencimientos se añade solo si pg_cron existe; lecturas/checkout también actualizan vencimientos.

## Validación
Pruebas de reglas y migración aislada con PostgreSQL PGlite + pgcrypto real. Cubren precio, comprador, plazo exacto, sesión única, cero filas, invitados con correo verificado, bloqueo de conflictos, rollback de órdenes/ítems y privacidad. No constituyen verificación del esquema, RLS ni cuentas reales de producción.

Pendiente: auditoría real, migración, sesión Admin/coleccionista, flujo Stripe de prueba, envío real Resend y revisión visual en el sitio externo. No se dispone de credenciales de producción en este entorno.
