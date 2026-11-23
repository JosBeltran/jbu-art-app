# Product Studio Dynamic Matrix: audit and contract

## Audit before implementation

The deployed baseline is main 2589d4c (PR #84). Both its preview commit and merge
commit have successful Vercel deployment statuses. No deployment was started here.

Existing flow:
Artwork (including version rows in artworks) → /admin/product-studio/UnifiedStudio
→ nativeDiscover/nativeConfigure → fresh nativeResolve/addNativeCandidate →
product_discovery_candidates.catalog_snapshot → saveWallArtDrafts → locked,
idempotent save_wall_art_studio RPC → products + N product_variants → exact disabled
provider_product_mappings + product_discovery_selections + artwork_products +
wall_art_mockups + country price_book_entries → existing publication workflow.

The model already supports configurable products and per-variant/country prices.
Product status is a lifecycle field; it is not a variant type. A selected artwork
version is itself an artworks UUID, already preserved by session.artwork_id and
artwork_products. No guessed root/version link or parallel version entity is needed.

Audited modules: providers.js (Gelato v3 catalog/search and Prodigi v5 parent/variant
pages), providerNative.server.js, contracts.js, service.js, configuration.js,
UnifiedStudio/NativeConfigurator/StudioEditorial, /admin/products/page.jsx,
commerce.server.js/commerceCheckout.server.js and CommercialPresentations. The
migrations 20261208/10/12/13/14/15/17 establish the existing model and save RPC.

Findings:

- Configuration only exposes one 25-row source page and replaces dropdown options
  on Next. Source filtering can leave fewer commercial rows than source rows, so
  commercial count must never advance pagination. Short pages without an explicit
  terminal/total need an empty-page probe, not assumed completeness.
- The save RPC already serializes by session and returns the previously created
  product IDs on retry. It inserts the artwork relation, candidate selection and
  exact mapping. These must be read back, not reconstructed from titles.
- productDetails omits discovery selections/session provenance. Administration
  always shows blank manual artwork/candidate linking forms even if relations
  already exist. That is a handoff/read-model/UI issue, not proof of missing rows.
- Mockups are illustrative and mappings start disabled. The Studio does not certify
  image rights, approve sale prices or claim fulfillment readiness.
- Public commercial projections already select published eligible variants and
  country prices. Cart/checkout carries the exact JBU variant UUID and freezes its
  approved provider mapping; Stripe semantics need no replacement.

Implementation extends these entities and interfaces. Existing rows, SKUs, public
URLs, source checkpoints and price/publication approvals must not be rewritten.

## Implemented normalized discovery contract

POST `/api/admin/product-catalog`, using the existing Admin authorization, with
operation `nativeMatrixPage` and input `{provider,catalogId,presentationId,country,
offset}` reads one source page. It does not create products or sync runs. Category discovery requests `nativeDiscover` with `complete:true`: it reads parent metadata and shows presentation definitions as they arrive. Opening a presentation starts its own configuration discovery. The variant matrix is selectable once that presentation is complete. Source
selection is scoped to the existing versioned commercial presentation. Existing
Gelato/Prodigi server keys and permissions are reused; no new secret or cron is needed.

The normalized page contains exact candidates, commercial/technical schemas and
`discoveryPage: {sourceCount,sourceIds,offset,limit,explicitNext,nextOffset,total}`.
Source counts/cursors are captured **before** commercial/destination filtering. Prodigi advances by its returned applied `limit` (which can exceed the row count); Gelato uses explicit continuation or the actual source count. An empty intermediate page with a continuation/window is not mistaken for the end.
Current contracts use numeric offsets; no opaque cursor format is invented.

`discoverMatrix` collects these pages sequentially behind a progress state. Explicit
continuation is respected; absent total/terminal metadata, nonempty short pages are
followed by an empty-page probe. It deduplicates on exact product ID + variant ID +
canonical reported option JSON, preserving every exact provider identity and each
configuration's original source-page offset. Repeated/nonadvancing pages and
contradictory totals are errors, never a claim of completeness.

Transient unreachable/rate-limit errors receive at most two automatic retries per
page. Retry-After seconds and HTTP dates are honored. Delays beyond ten seconds
pause automatic work; manual Retry remains disabled until the indicated time.
Failures retain an in-memory page checkpoint and report incomplete. Incomplete
sets cannot be selected in the matrix. Completed tab-local sets expire after five
minutes and can be explicitly refreshed. This is not a shared supplier SKU index.
A reload restarts the scoped read; already selected candidates remain in the
existing persisted session. No successful partial collection is cached as complete.

Provider APIs do not expose an atomic cross-page catalog snapshot in the audited
contracts. Completeness means all observed source pages for this query reached a
verified terminal condition; it is not an assertion that a remote catalog cannot
change during/after the read. Exact selected configurations are reverified on Add
and again before final draft creation. Public checkout never loads this matrix.

## Matrix, selection and generation

`dynamicMatrix.js` derives variable commercial attributes and compatible cells
from actual rows. Administrators choose up to two axes; remaining attributes are
filters. A cell with one configuration is selectable; absent combinations are
disabled; ambiguous cells require filtering/disambiguation. A one-dimensional or
mobile accessible list selects exact configurations. A grid larger than 144 cells
uses the actual-configuration list rather than allocating a large Cartesian view.
Long lists explicitly show the displayed/total count and Show more; source discovery
is already complete. No mathematical Cartesian product generates supplier items.

Individual, row, column, visible-valid bulk selection and explicit clearing are
supported. Exact staging choices are persisted in `product_discovery_sessions.criteria.matrixSelections` through the owner-checked private `set_studio_matrix_selection` RPC; `removeStudioSelection` only removes an explicit owned choice. A source variant shared by multiple Prodigi option combinations therefore resumes with those choices intact. No parallel selection or variant table is introduced. IDs are independent of row positions and filters. The existing maximum
of twelve selected configurations per session is visible; discovery itself is not
truncated to that count. Refresh preserves selected rows and marks changed/missing
ones for attention, blocking progression until reviewed. No selection is silently
deleted. Manufacturing costs remain destination/currency-specific, with shipping,
tax, file suitability and unresolved production eligibility clearly separate.

The existing seven-stage review/editor groups by presentation and submits one
product with N explicitly selected variants. Duplicate product groups are rejected.
The existing save RPC remains transactional and idempotent by locked session. Add
and final save verify actual source configuration, exact UID, supported destination,
reported options and presentation matching. Definitions are shared only within that
verification request, and source reads are batched in groups of four. No price is
automatically approved and no supplier order is submitted.

Uncommitted same-presentation native candidates can be explicitly reverified after
refresh via a private, owner-checked `refresh_studio_candidate` RPC. It locks the
workspace and candidate, rejects committed selections and never rewrites canonical
provider rows. The save RPC compares the server-read source snapshot before creating
variants, so an intervening refresh rolls the transaction back. Conflicting supplier
construction/presentation snapshots are rejected rather than silently combined.

A successful one-product save redirects to `/admin/products?id=<exact JBU UUID>`.
Multiple distinct presentations retain their separate existing draft links. Explicit
unlinked creation uses the existing Product Administration New Product route state;
Studio artwork-originated creation requires and preserves its exact artwork UUID.

## Handoff correction and migration

Apply `supabase/migrations/20261218_product_studio_matrix_handoff.sql` before releasing
the new application. It replaces the existing save function and adds private
refresh/selection functions using the existing workspace criteria JSON. There are no new tables, duplicate catalogs or record backfills.

For newly generated drafts the function also:

- retains the chosen destination in existing `allowed_countries` when pricing is
  still pending (priced destinations keep the existing price-book behavior);
- attaches the selected ready, private, same-artwork derivative through the existing
  `product_variant_assets` production relationship as well as the disabled mapping;
- preserves the server-captured artwork preview URL from session creation, including
  exact artwork/version/parent provenance in existing session criteria.

These fill previously missing handoff details. They do not validate a supplier print
area, approve an image/price, enable a mapping or publish a product. Old sessions
without preview provenance use the existing source-photo fallback. Earlier source
snapshots, product IDs, prices, SKUs, mappings, galleries and publication states are
not rewritten. The original artwork/version relation is never guessed from text.

`productDetails` reads saved selections, mappings, Studio sessions, exact version
and explicit parent provenance. It evaluates existing publication diagnostics and
flags actual missing artwork/candidate/mapping relationships. Administration shows
a responsive overview with readable variants, country-price review, manufacturing
cost requests, separate production/publication readiness and registered/illustrative
imagery. Existing edit, price approval, image rights and production confirmation
controls remain under disclosures. Production-derived attributes of Studio configurations are read-only through the Admin API; commercial content and price workflows remain editable without rebinding the supplier configuration. Known relationships no longer look like blank
mandatory foreign-key forms. Technical identifiers remain available in provenance.

Public selection reuses `marketVariant`/existing price resolution and only lists
sellable choices for the selected destination/currency. Changing destination does
not silently substitute the selected variant: an unsupported current choice is
marked unavailable and cannot enter cart. Existing server checkout validation,
shipping policy, frozen mapping and Stripe semantics remain unchanged.

Rollback: revert application code and restore the prior save function body from
20261215 if needed. The new function remains compatible with older callers that do
not send snapshot fences; production attachments/country intent in newly created
drafts remain valid existing-model relationships. Do not delete created drafts,
source snapshots, assets or mappings to roll back. Remove the private refresh RPC
and private selection RPCs only after the application no longer calls them.

## Verification and remaining acceptance

Automated coverage includes migrated PGlite transactions, exact artwork-version and
file/image provenance, three selected variants, session replay, independent draft
prices, missing-price destination retention, stale-source rollback, immutable saved
snapshots, restricted refresh permissions and Prodigi configurations sharing one
source variant. Discovery tests include later short pages, overlaps, Retry-After,
partial retries, contradictory metadata, repeated pagination and ambiguous/invalid
cells. Prodigi option sets without reported compatibility remain unresolved, revisit the affected source page on retry and never claim complete/selectable coverage. Existing single-variant/pricing/cart/checkout/publication tests continue.

Browser scenarios run the actual Studio and Product Administration components in
English desktop/light and Spanish mobile/dark. They exercise an injected later-page
failure/resume, keyboard selection, bulk selection, filter retention, unavailable
selection attention/restore, source cost request, review, redirect and Admin readback.
The browser API handler runs the real native service against clearly identified
contract fixtures; the customer-preview panel is not mounted in these Admin tests.

The observed real Posters fixture from the previous phase contains only cards.
Positive matrix products, Industrial Pulse pixels, price responses and source
mutations in automated scenarios are simulated. These results are not credentialed
live Gelato/Prodigi acceptance. A live qualifying presentation is still needed to
confirm real latency, complete source traversal, manufacturing cost and save readback.
Existing drafts with genuinely missing historical relationships are reported for
review; no speculative historical repair/backfill was performed.

Manual administrator check after migration and an approved preview deployment:

1. Choose an artwork/version and optional ready derivative in Product Studio.
2. Choose provider/category/presentation. Wait for complete discovery; a failure must
   show incomplete and Retry must resume without changing already selected IDs.
3. Choose axes/filters, select several exact configurations and inspect unavailable
   and ambiguous cells. Refresh and confirm selections stay visible for review.
4. Request destination manufacturing cost; retain explicit unknown shipping/tax and
   pending selling-price approval. Review mockups and each variant's country price.
5. Create the product draft. Confirm redirect, exact artwork/version, selected variant
   count, preserved production file and disabled exact source mappings in Administration.
6. Complete only remaining image/price/production confirmations and the existing
   publication workflow. Verify the public destination selector and cart retain the
   chosen exact JBU variant; do not create a real payment or supplier order for this test.

Contract references checked during the audit: Gelato's [Product Search](https://dashboard.gelato.com/docs/products/product/search/)
uses limit/offset with a maximum limit of 100; the [Prodigi OpenAPI](https://www.prodigi.com/print-api/docs/openapi.yml)
explicitly advances by its returned applied limit, permits shorter data arrays and
stops unknown-total traversals on an empty page. The adapters preserve these
separate semantics. Parent/definition metadata reuses the existing 24-hour optional
cache. Completed configuration queries use the same Supabase table and a short browser cache.

Local final verification: 85 Node tests, scoped ESLint, TypeScript via the production
build and four actual Studio/Admin browser scenarios pass. The database tests apply
all migrations through 20261218 in an isolated PGlite database; no production migration,
payment, supplier order, deployment or merge was executed for this change.

## Persistencia de matrices completas en Product Studio

Descubrimiento lista las tarjetas a partir de los metadatos de catálogo, padres y
definiciones. Las tarjetas indican el tipo de presentación y proveedor. La
disponibilidad para el destino, tamaños y atributos se verifican en Configuración
al abrir solo una presentación.

Las matrices usan `provider_metadata_cache` con una identidad estable de proveedor,
catálogo, presentación, país, selección normalizada, versión de reglas y huella
de la definición. Una matriz vigente se reutiliza entre obras. JBU puede reutilizar
una matriz del formato de clave anterior cuando conserva la misma huella y versión.
Se refresca una matriz vencida y, si el proveedor no responde o limita solicitudes,
se puede mostrar la última matriz compatible marcada como anterior.

Las matrices grandes avanzan en tramos de hasta tres páginas. La posición y las
filas acumuladas se guardan como un checkpoint en la misma tabla. Una concesión
temporal por clave evita que dos procesos consulten la misma matriz simultáneamente.
Solo las matrices que llegan al final sin combinaciones pendientes se guardan como
completas. Si Supabase no está disponible, la pantalla conserva el mecanismo
paginado existente para seguir explorando. La tabla conserva su límite de tamaño
por registro. No hay migración.

Actualizar catálogo renueva metadatos. Actualizar configuraciones vuelve a
consultar la presentación abierta. La selección y guardado de SKU conservan
la validación con el proveedor. La caché se usa para exploración.
