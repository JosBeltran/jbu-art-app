<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Built-in outdoor promotion presets live in lib/promo/presets.js; render CLIXMEDIA through its native canvas branch and timeline so existing presets remain unchanged and its last four seconds stay static.
- Keep historical Admin READY FOR CLAIM eligibility in lib/adminReadyForClaim.js and enforce it in the list's server query; this isolates operational rules from shared sale and certificate eligibility.

- Public discovery uses getArtworks and the shared effective Series predicate; direct SKU and certificate routes remain separate to preserve preview and verification access.
- Certificate reads share the explicit artwork-to-profile FK join and normalization; transactional RPCs recheck the locked profile name so immutable snapshots cannot capture a stale or missing linked author.
- Admin order operations use a server API with verified separate-role authorization, an operational-field allowlist, and persisted-row readback; never infer success from an error-free zero-row update.

- Collector and Admin preview share lib/collection/data.js and CollectionView; Admin preview requires a verified separate user_roles row, disables mutations, and never labels privileged reads as RLS checks or changes target sessions.

- Accepted offers and auction winners share lib/payments projections, the existing checkout builder and the existing winner visual block; no sale-opportunity entity is allowed.
- finalize_pending_purchase atomically extends existing winner order/item fulfillment to accepted offers; source-bound sessions prevent duplicate or partial pending purchases without changing ordinary cart/Buy Now.
- Private notifications use server-only committed event producers, recipient-scoped reads and leased email delivery; read state is independent of business and delivery state.

- Legal acceptance is append-only in user_legal_consents keyed by Auth ID and document versions; email signup records it in an isolated Auth insert trigger, and authenticated Google completion uses an idempotent RPC with server timestamps so existing profile/role provisioning stays untouched.
- Legal document content lives in data/legalDocuments.js; canonical and legacy pages share the existing editorial InfoShell so legal updates do not require presentation changes.
- CookieConsent inside the Carbon Theme owns browser-scoped optional choices; analytics and third-party chat must read the current choice before loading or sending, and chat withdrawal fully reloads to unload vendor code.
- Tidio loads once via next/script in the existing shared client shell; lib/tidioContext.js allowlists public context and uses shared commerce rules so private identity, URL secrets and hidden prices never reach chat properties.
- Merchant XML and Admin diagnostics share the explicit public artwork projection in lib/googleMerchant.js; select only verified schema columns so legacy mapper aliases cannot break either read.

- Display currency lives in CurrencyProvider (lib/currency.js) with one cached /api/exchange-rate; MXN stays the stored and charged currency, so USD is display-only and never reaches checkout, feed or stored prices.
- Local delivery eligibility and appointment validation share lib/localDelivery.js with Luxon calendar arithmetic; server callers supply their clock and persisted configuration so browser time and client classification cannot authorize a delivery.

- Local orders reuse orders/order_items and reserved_order_id; SQL owns creation and transitions, and complete_order_originals is shared with signed Stripe fulfillment to prevent partial sales and foreign-reservation overwrite.
- Delivery Calendar uses deterministic Google event IDs and leased revision fencing; order state is authoritative and sync/email failures cannot invalidate a committed reservation.
