# Administrative Artwork Inventory

## Architecture and rollout

Apply `supabase/migrations/20261227_admin_artwork_inventory.sql` after the existing artwork version, physical-edition, order, and Studio commerce migrations. Deploy the app after the database migration. The inventory API returns a retryable error if its RPCs are unavailable.

`components/admin/AdminDataGrid.jsx` renders Carbon controls and accepts a record identifier, columns, renderers, filter options, query state, selection, action renderers and pagination from its caller. The artwork page supplies translated labels, list views, editors and artwork-specific actions. Grouping uses the displayed page and labels its counts accordingly. Selection covers the displayed page, including collapsed groups, and resets when the query or refresh changes the result set.

The server checks the Supabase session and the existing separate administrator role before calling inventory RPCs. The database grants the RPCs to the service role. The API sends a narrow record projection with cache disabled. SQL binds search and filter values, applies filters across the inventory, sorts using a fixed allowlist and an ID tiebreaker, and returns an exact count with a page of 25, 50 or 100 records. Search uses literal, case-insensitive partial matching with accent folding for common Spanish and Western European letters. Facets are loaded on entry and refresh. The migration indexes the default ordering and the artwork references used for print and workflow lookups. On a substantially larger catalog, review the full-count and substring-search plans before choosing a search index or materialized strategy.

Catalog status, sale availability and ownership status have separate columns and filters. The physical edition field supplies the artwork types used by the public catalog. Print counts combine eligible legacy print options with the existing Studio commerce eligibility function and exclude replaced legacy variants. Counts express availability across markets, without a destination-specific shipping quote. Historical labels use database lineage flags, and repeated suffixes added by the snapshot editor are omitted from the inventory title display. The existing version manager handles navigation to related records. The model stores lineage and publication metadata without a version number.

Account preferences reuse Supabase Auth user metadata and the existing preference writer. The versioned `jbu_artwork_inventory` entry stores column order, visibility, density and up to 20 named views. A view also stores filters, search, sorting, grouping and page size. The URL tracks the current query and view. Each artwork edit link carries a validated inventory return path, and session storage restores the table's scroll position for that URL. The edit form, provenance, and public inventory continue through their existing routes.

Bulk changes operate on the reversible sale-availability states **Available** and **Not for sale**. The administrator previews each outcome and confirms the eligible records. On confirmation, SQL locks each artwork, rechecks the existing workflow conditions and verifies the persisted status. A short transaction takes non-waiting shared locks on the order, offer and auction tables to fence concurrent writes during validation. Busy requests can be retried. Records with active commerce obligations, ownership or certificate data, historical or draft-successor metadata, and physical limited editions are protected. Sold and reserved states stay under their existing workflows. The action returns per-record success, failure or skip outcomes.

## Thumbnail and memory audit

The previous page executed an unrestricted `select('*')` before slicing 15 rows in the browser. It loaded owner profiles separately, retained the returned artwork array and rendered full primary image URLs directly through eager image elements. Application-level pagination did not reduce the artwork payload. This path could increase transferred bytes, decoded image memory and JavaScript allocations. Inspection of the old and new inventory components found no base64 image or binary state and no object URLs. The previous code had no mechanism to cancel an in-flight inventory read. The new grid aborts obsolete reads and ignores their responses. React owns the grid handlers and thumbnail error callbacks. The grid has no document-level scroll or image listeners.

Of 60 image paths in the repository seed, 56 resolved to files inspected with Sharp. They ranged from 729 to 1,200 pixels wide, 846 to 1,402 pixels high and 53,996 to 266,206 bytes. Median width, height and file size were 944 pixels, 1,127 pixels and 107,800 bytes respectively. The seed provides a sample of checked-in public assets. Production Storage originals, their metadata and the browser session associated with the reported incident were unavailable.

Inventory images use a 40–48 CSS-pixel frame, asynchronous decoding, native lazy loading and a fixed placeholder. The optimizer preserves the source aspect ratio. It requests 96-pixel or 128-pixel widths for standard and high-density displays, so portrait output can exceed those values in height. For Supabase public artwork images the client requests the existing 800-pixel WebP derivative through the optimizer first. If it is unavailable, the optimizer can derive and cache a small image from the allowlisted public primary source. The browser requests only optimized output. Unsupported sources, private storage, masters, and failed images resolve to the placeholder. The app's existing Next.js image cache is reused. In a production-build smoke test, the local `JBU-019.webp` returned WebP at 96 × 115 pixels and 1,374 bytes, and 128 × 153 pixels and 2,098 bytes, both with a 2,678,400-second cache lifetime. A cold cache can still require server-side decoding of a public primary source if its preoptimized derivative is absent.

### Measured comparison

Chromium rendered the before and after React/Carbon components against the same 750-record fixture at 1440 × 900 and device pixel ratio 1. The fixture served checked-in artwork files and used Sharp to deliver the requested thumbnail width. Network counts below cover resource entries after the HTML document, including cache hits. Image transfer includes headers and excludes cached bodies. Data size is the decoded fixture response. Heap is V8 used heap after a forced garbage collection. It excludes native decoded images, GPU memory and server memory.

| Initial measurement | Before | After |
| --- | ---: | ---: |
| Rows visible in the table model | 15 | 25 |
| Resource requests | 24 | 31 |
| Image resource entries | 14 | 24 |
| Image bytes transferred | 1,432,790 | 42,252 |
| Sampled image widths in pixels | 944, 1122, 1149 | 96 |
| DOM nodes | 771 | 957 |
| Data response bytes | 1,558,333 | 9,375 |
| JavaScript heap bytes after GC | 9,802,068 | 8,889,836 |

| Measurement after interaction | Before | After |
| --- | ---: | ---: |
| Cumulative image bytes after four next/previous cycles | 2,815,252 | 92,380 |
| JavaScript heap after those cycles | 10,348,420 | 10,083,088 |
| JavaScript heap after changing to 100 rows and searching | — | 18,934,472 |
| DOM nodes after changing to 100 rows and searching | — | 3,293 |
| JavaScript heap after three visits away and back at default size | 9,340,296 | 8,548,392 |

The fixture shows more small requests on the larger first page and about 97% fewer initial image-transfer bytes. The 100-row view uses more DOM and JavaScript heap than the 25-row view. Default-size post-navigation heap was close to the initial sample in this run. The evidence supports smaller image and data transfers in this fixture. The cause of the original memory exhaustion and long-session production memory behavior remain unverified. Pagination and thumbnails bound client work without a virtualized table.

### Reproduction

Run the SQL integration tests and the Chromium suite:

```sh
node --test lib/adminArtworkInventory.database.test.js
npm install --prefix /tmp/jbu-inventory-tools esbuild playwright
JBU_BROWSER_TOOLS=/tmp/jbu-inventory-tools \
JBU_CHROMIUM_PATH=/usr/bin/chromium \
JBU_INVENTORY_BASELINE=64ed2f48a0157846c376ada2b413829cd34461d2 \
node --test tests/adminArtworkInventory.browser.mjs
```

For production measurement, run the two revisions against a staging inventory with 500–1,000 representative records. In Chromium DevTools, capture the Network log on a cold start and then on a warm start. Record document, inventory API and image counts and transferred bytes. Inspect the displayed image dimensions and the optimizer's response headers. In the Memory panel, take heap snapshots after a first-page load, four next/previous cycles, a switch from 25 to 100 rows, filter changes, and three exits from and returns to the inventory. Use the same viewport and device pixel ratio on both revisions. Compare detached elements and retainers. Record GPU and native process memory alongside heap to observe decoded images, and compare cold optimizer-worker memory separately. Use staging administrator and non-administrator accounts to check real role enforcement, saved preferences, and the return to the filtered inventory from the actual editor. The local Chromium suite uses fixture router, API and account boundaries, and PGlite executes the migration against a focused schema fixture.
