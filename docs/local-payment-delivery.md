# Local payment on delivery — implementation status

## Stage 1: production audit and scheduling foundation

Production metadata supplied by the operator confirms existing orders/order_items can be reused and Stripe identifiers are nullable. No delivery-category, payment-method, payment-status or delivery configuration columns currently exist. Existing order enum lacks pending confirmation. Existing XP trigger awards on PAYMENT_RECEIVED, not on DELIVERED.

The supplied availability trigger forces SOLD when ownership is sold/claimed/verified; it does not protect reservation identity. The current permissive authenticated artwork UPDATE policy and legacy Stripe fulfillment must be protected before local reservations are enabled. Existing order-item Admin policies still use profile roles; new lifecycle authorization must use user_roles.

`lib/localDelivery.js` now provides centralized municipality normalization, configurable lead times/business hours, mixed-cart classification, UTC window generation and revalidation using Luxon in America/Monterrey. Defaults remain disabled and missing classifications fail closed. This module is not yet imported by checkout, Admin, APIs or Calendar.

Tests: `node --test lib/localDelivery.test.js lib/artworkCommerce.test.js` — 46 passed, including 37 new scheduling/eligibility tests. These are unit tests, not production/end-to-end verification.

## Remaining implementation

- Additive schema and atomic order/reservation operations, guarded cancellation/delivery and shared sale completion covering existing Stripe sessions.
- Checkout/auth draft continuation, complete address validation, scheduling/review UI and Admin configuration/category/lifecycle controls.
- Existing notification/email/XP integration and reservation-aware claim protections; preserve certificate approval flow.
- Studio Google Calendar connection and secure Vercel runtime configuration, revision-aware idempotent synchronization/retry.
- Database integration tests, complete regression suite and authenticated customer/Admin/Stripe/Calendar end-to-end verification.

No migrations have been written or applied in this stage. No checkout behavior, production orders, inventory, ownership or certificates have changed. Do not enable pay on delivery based on this foundation alone.