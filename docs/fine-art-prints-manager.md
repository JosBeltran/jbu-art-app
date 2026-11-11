# Fine Art Prints Manager

## Repository audit

| Area | Finding |
| --- | --- |
| Data model | Each `artwork_prints` row is a sellable variant. Storefront and checkout already use its ID, `artwork_id`, size, finish enum, price, edition type, maximum edition size and publication state. The repository assumes base Supabase tables already exist and does not contain their complete DDL or original policy definitions. |
| Admin | The artwork editor embedded a browser-side create/delete widget. The application already has an authenticated Admin shell, separate-role verification through `is_jbu_admin()`, Carbon components, and Spanish/English strings. |
| Images | Gallery and public provenance references already exist, and `is_print_image` supplies a gallery fallback. The artwork uploader already uses the public `artworks` bucket and starts image optimization in the background. |
| Discovery | `/prints`, catalog and series share artwork-level discovery. Original availability is separate from artwork discovery, allowing reproductions of sold originals with public status. Publication also depends on parent Series visibility and the artwork's `allows_prints` flag. |
| Checkout | Guest Open Editions already use persisted snapshots and a separate feature-flagged checkout. The signed-in cart discarded Limited variants during refresh. The existing registered webhook's print snapshot code was in the pending offer/auction branch instead of the registered cart branch. Its SQL counted inventory at parent level. |
| Fulfillment configuration | No Prodigi configuration or fulfillment contract for these rows is defined in the checked-in print manager or checkout. Edits update an explicit allowlist, preserving additional columns on existing rows. |

## Implementation

1. Extend the variant table additively and keep the existing foreign key and edition/finish enums. Restrictive RLS policies protect drafts and writes while retaining existing RLS decisions. The API validates the separate admin role, accepts only the management fields, and uses a service-only RPC for atomic saves. Client-issued variant IDs make create retries idempotent. SKU checks ignore case and surrounding space.
2. Use one Carbon form at `/admin/prints` for create, edit and duplicate. Save and add another keeps the parent and common format. Duplication also keeps the commercial copy and image selection. Both reset the SKU, price, Limited Edition quantity and publication state. The original artwork editor links into the filtered manager.
3. Prefer assigned images on `/prints` and retain the flagged gallery fallback. For the general catalog, an available original keeps its original image, and a sold original can use the flagged print image. Publish turns on the parent's print flag in the same transaction. Parent artwork and edition type are fixed after creation because existing sessions and orders reference that variant.
4. Preserve the existing MXN price base and server-side currency conversion. Keep the guest cart for Open Editions and scope Limited Edition cart entries to the collector on the current browser. Registered checkout records the chosen print on the Stripe line item and fulfills it using the existing order transaction, with atomic Limited Edition inventory updates and immutable order snapshots. Existing order history is untouched. Linked paid items provide a lower bound for imported Limited Edition sold counts.

Keep the current variant-per-row model. A separate parent print product would be worth considering if many sizes need shared editorial content and independent merchandising. That would require a stable product identity and an explicit migration plan for existing variant URLs and order snapshots.

## Deployment and verification

1. In staging, confirm the baseline schema, the separate admin role, the public provenance view, and the `artworks` bucket's existing upload policy for the `artwork-images/prints/` prefix. Confirm that the active variant SELECT policies support public artwork detail reads.
2. Confirm the guest print and variant image migrations are present, then apply `supabase/migrations/20261122_fine_art_prints_manager.sql` before deploying the application. For a fresh install, the prior image migration includes a corrected SQL function delimiter. If the guest checkout flag is in use, retain its current staging/production settings.
3. Verify an ES/EN draft, gallery and upload selection, activation, a guest Open Edition checkout and an authenticated Limited Edition checkout with Stripe test credentials. Confirm the two orders retain the selected variant, size, price and image.
4. Limited inventory is checked at checkout and updated atomically when fulfilling a paid order. Existing Stripe sessions do not reserve stock before payment. Simultaneous payments for the final copy can therefore require Stripe reconciliation or a refund, while the database prevents a second fulfillment. Historical orders without a linked variant cannot reliably be attributed to a specific Limited Edition.

The focused CI job runs the catalog/cart/image tests and the management tests against an embedded PostgreSQL fixture. It also runs the existing production build command.
