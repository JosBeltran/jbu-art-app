# Artwork Print sizes and deferred masters

Apply these migrations after the repository's existing migrations, in this order:

1. `20261228_artwork_print_discovery_sizes.sql`
2. `20261229_artwork_print_master_attachment.sql`

No orders, checkout or fulfillment feature is introduced or changed.

The Artwork Print editor has a normalized size selector. Recognized historical
labels are backfilled without replacing records; unrecognized labels need an
explicit choice. The descriptive size text remains independent. Only active
Artwork Prints with a normalized size enable discovery configurations. Supplier
availability, dimensions and orientation still apply; no file or DPI is required
to discover, select or save a draft.

Selections pin the exact Artwork Print ID in the existing session matrix
manifest. Saved variants keep an FK in `product_variants.artwork_print_id`.
Deactivating a selected print blocks saving; a different print of the same size
does not silently replace it. Deletion and identity changes are restricted once
a draft references the record. Existing saved products are not guessed or
backfilled onto arbitrary source prints.

Edit that same Artwork Print to upload and inspect the final paper-sized master.
Small files use the existing signed direct upload; large files reuse the 50 MiB
resumable transfer from this PR. The final image is checked for canvas aspect,
orientation and minimum resolution. For an existing approved generated preview,
the composition must also match. A bounded thumbnail and explicit confirmation
precede attachment.

The private file is committed only after Storage transfer succeeds. An existing
pending preview is filled without changing its revision ID, preview or layout.
A print with no generated revision gets its first subordinate master record;
the Artwork Print ID remains unchanged. Existing ready masters are not replaced
through this action. Normalized sizes cannot be changed to contradict an
existing production canvas.

Later production-source resolution is restricted to the pinned print. Opening
the product uses the existing resolver to link a validated compatible master.
Production mapping, publication and provider validation remain required. The
product overview links directly to the referenced Artwork Print for upload.

Validation commands:

```sh
node --test tests/artworkPrintSizes.test.mjs tests/printSourceUpload.test.mjs
node --test tests/artworkPrintDiscovery.database.test.mjs tests/artworkPrintMaster.test.mjs
npm run build
```

The focused pure-JavaScript tests run locally. PostgreSQL/image tests and the full
build run in the repository's print integration CI; the editing host could not
clone or install packages because outbound DNS was unavailable.

