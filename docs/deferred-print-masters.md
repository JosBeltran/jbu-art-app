# Fine Art Prints with deferred masters

## Repository audit

The A1 and A2 generator already stores the resolved pixel geometry in
`print_asset_generations.layout` and the preview on the existing
`artwork_prints` variant. Its prior database contract required a private JPEG
even when the administrator only needed a storefront preview. Older
generations without a layout still have their existing masters. Exact
historical geometry cannot be inferred for those records.

The storefront already discovers historical print variants under the public
artwork and series rules. Guest and registered checkout use separate
transactional order functions. Both already retain the variant ID and preview.
No Fine Art Prints code submitted orders to Prodigi automatically. The order
preparation screen supplies the approved file for the existing manual handoff.

## Storage and state

- The default stores an optimized WebP in the existing public `artworks`
  bucket. The alternative also renders a full-size JPEG in private
  `print-masters`. The variant, price, availability and publication remain in
  `artwork_prints`.
- Each approved revision has an immutable layout, original source fingerprint
  and public preview. Replacing the composition creates a new revision on the
  same print variant. The previous revision remains available to its orders.
- The checkout pins the revision associated with the displayed variant image.
  The paid-order transaction creates a private preparation row with the purchased
  specs. A missing master never changes payment status. Admin notification events
  are deduplicated per order and recipient. Only admins get short-lived master
  links. Shipping waits until all managed items are approved.
- Deferred generation validates oriented aspect ratio, effective DPI and
  framing against the purchased preview and renders the stored pixel rectangle.
  Administrators review the original and proposed previews. A mismatched
  composition requires an explicitly approved new revision for future purchases.
  For an existing purchase, use a compatible source or resolve the order
  manually with the customer. The purchased snapshot stays intact.
- An uploaded preview source is staged privately and removed after the save.
  Keep the original file separately to re-upload later. Deferred comparisons
  and generation clean up their staging uploads. If a browser upload is
  abandoned before a request reaches the server, remove the old staging object
  through Storage administration after the upload URL and any active operation
  have expired. Keep revision master paths and public previews referenced by
  orders.

## Deployment

1. Apply migrations through `20261127_historical_print_discovery.sql`, then
   apply `20261128_deferred_print_masters.sql` before deploying the app. It adds
   revision IDs and marks existing masters approved. It does not create new
   records for existing paid orders or move existing storage objects.
2. Deploy the application with its existing Supabase Storage, Stripe, and
   notification settings. The two existing checkout functions keep their
   signatures so pre-deployment sessions can complete.
3. In staging, create an A2 or A1 preview-only draft, publish it, buy it using
   Stripe test mode, and check **Orders → Print preparation queue**. Compare a
   compatible source, generate, inspect, and approve. Download the file for
   manual fulfillment and confirm the order can then be marked shipped.
4. Run the same smoke check for a historical version and for a variant with an
   existing master. Verify anonymous access cannot read either private table or
   private Storage objects.
