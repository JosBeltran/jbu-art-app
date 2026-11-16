# Physical Limited Editions

Each frame option is an independent artwork with its own SKU, title, images, price, shipping policy and numbered inventory. The catalog and series routes use `?type=LIMITED_EDITION` and retain the market filter. Sold-out editions remain discoverable while their artwork and series remain published.

## Staging setup

1. Apply the existing physical edition migrations (20261114 through 20261117), the existing artwork version and global shipping migrations through 20261202, then `20261203_physical_edition_experience.sql`. The experience migration does not activate any edition.
2. Use a staging Supabase project and Stripe test keys. Verify the existing checkout shipping manifest RPCs, the signed Stripe webhook in test mode, the separate admin role and the private certificate PDF bucket.
3. Configure separate test artwork records for First Current and Surface Drifty in Natural Wood and Black Frame. Set the artwork title, medium, technique, dimensions, primary image, price and shipping in the artwork editor. Set each physical edition to 20, with made-to-order enabled and its frame description. Confirm the signature toggle only when the physical process includes that signature.
4. Check readiness and enable sales from the manager. The checklist validates the persisted setup, including at least one payable shipping destination. The Stripe checkout validates the exact destination and live policy on every attempt.
5. Buy as a verified test collector. Confirm the assigned number on the success page, then check the matching unit in the collection. Set the paid staging order to Delivered and issue its certificate. Check the PDF and public verification by unit SKU, and verify another collector cannot access the order or private PDF.

## Operations and verification

- Catalog country and edition type filtering run on the server. Localized search, sorting, availability and display pagination operate on the resulting public records. The admin inventory uses server pagination and status filtering.
- A paused edition accepts no new reservations. Previously opened Stripe sessions can finish. Verified expiration releases unpaid reservations. The administrator should review any ambiguous payment or session-binding failure before releasing its unit.
- The supported purchase flow is a dedicated, authenticated Stripe checkout for one numbered unit. Prodigi production and shipping can be handled manually. Edition number selection, mixed carts and automatic restocking on refund are outside this implementation.
- Availability derives from persisted inventory. The limited-availability label begins at the final 10% of the edition, rounded down with a minimum threshold of one.
- Issued PDF access uses the existing owner-authorized download endpoint. Public verification exposes certificate and unit details through the existing verification route. A pending PDF can be retried through the unit certificate action.
- Production Stripe charges, concurrent independent PostgreSQL sessions, live webhook delivery, actual supplier fulfillment and real certificate storage require staging verification. The PGlite tests exercise the database transitions and duplicate fulfillment without sending charges or creating production records.

Targeted regression suite:

```sh
node --test lib/physicalEdition.test.js lib/physicalEdition.database.test.js lib/artworkCommerce.test.js lib/physicalEditionIdentifier.test.js lib/certificates/physicalEdition.server.test.js lib/countryAvailability.test.js lib/shipping.database.test.js
```
