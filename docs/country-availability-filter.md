# Country Availability filter

## Data model and filtering

Reuse `artworks.allowed_shipping_countries` for original artwork and numbered physical editions; use `artwork_prints.allowed_shipping_countries` for each independently purchasable Open or Limited Edition variant. These columns already exist in `20261201_product_shipping_countries.sql`. **No new Supabase migration required.**

The URL filter is `?country=SE`. Invalid/unknown country codes are treated as All Countries. The selector is translated through the current JBU language using `Intl.DisplayNames`, and no geolocation permission is requested. All Countries includes every item; NULL and empty arrays match every selected country.

Country filtering is performed in server data loaders after fetching the authoritative country restrictions and *before* publishing cards/result totals. Both the catalog and print collection currently render all matching cards without a separate paginated API; their existing search, series, status, size and sorting controls are preserved. The catalog selector keeps unrelated URL parameters intact.

Artwork catalog mode uses the original's country restriction. Print mode checks eligible active **variant** restrictions instead, independently of the original. The /prints listing returns only qualifying variant cards. Print detail options are filtered for a country carried from those lists, and the original purchase control separately checks its own restriction. This selected-country display is **not** an authoritative checkout request.

## Historical view consideration

The public `artworks_discoverable` SQL view was created before the shipping column existed. A PostgreSQL view with `SELECT a.*` does not automatically gain columns created later. Country-aware catalog reads the `artworks` base table instead of that view and preserves its existing active-series eligibility predicate through `getArtworks`. This avoids a database migration.

## Checkout

Existing Stripe-authoritative checkout code already validates `allowed_shipping_countries` on physical database item snapshots, computes intersection of nonempty restrictions, treats unrestricted items as neutral and uses MX/CA/US only when no physical restrictions exist.

Existing operational included-shipping coverage (`JBU_INCLUDED_SHIPPING_COUNTRIES`) is **separate** from the catalog filter. A GB-only product cannot silently ship to MX/US/CA; it is also blocked from checkout until GB is operationally supported. All signed-in, guest, auction, original and edition checkout flows remain unchanged.

## Verification

Added `lib/countryAvailability.test.js` covering NULL/[], one/multiple countries, unsupported codes, default and restricted options, variant-level visibility, country changes, filtering before pagination, query retention, and mixed-cart Stripe intersections. This PR was prepared using the GitHub connector; the working source tree and test runtime were not accessible from this connection, so the repository's test suite and Next.js build have **not** been run. Run:

```sh
node --test lib/countryAvailability.test.js lib/shippingCountries.test.js lib/catalogSeries.test.js
node --experimental-vm-modules --test tests/checkoutShipping.test.mjs tests/catalogPrintDiscovery.test.mjs
npx tsc --noEmit --incremental false
npm run build
```

Before merge, verify selected-country consistency on /catalog, /catalog?prints=true, /prints, /series/[slug], and /artwork/[sku]; then test UK-only, Sweden-only, and mixed-cart flows with Stripe test sessions.
