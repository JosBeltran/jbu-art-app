> The complete scoped discovery and matrix workflow in [dynamic-matrix.md](dynamic-matrix.md) supersedes the earlier page-by-page configuration controls below.

# Commercial presentations in the existing Product Studio

Product Studio now separates supplier → category → commercial presentation →
relevant source-valid options → exact manufacturing identity. These are controls
inside the existing Discovery/Configuration stages, not new wizard routes.

## Evidence and provider contracts

The user supplied a real **normalized JBU `nativeConfigure` response**, not a raw
Gelato HTTP response. It contains the Posters schema's 14 attributes, overlapping
PaperFormat/UnifiedPaperFormat and PaperType/UnifiedPaperType vocabularies, and
eight candidates whose exact source identities begin `cards_`. This demonstrates
that belonging to `posters` is insufficient evidence of a commercial poster.
No candidate in that sample establishes a positive poster acceptance result.

`tests/fixtures/gelatoPostersObserved.js` preserves a clearly identified excerpt:
all 14 attribute identifiers, all five unified stocks, all raw paper IDs, and all
eight observed candidate identities/source attributes. Long size and destination
arrays are trimmed; some labels use source IDs. Positive poster candidates in
that same file are explicitly **simulated contract fixtures**, with conspicuous
fixture UIDs. Industrial Pulse browser pixels/asset metadata are also fixtures.
Neither is a claim of credentialed provider acceptance.

Contracts reviewed:

- [Gelato catalog definition](https://dashboard.gelato.com/docs/products/catalog/get/):
  attribute and value UIDs describe a manufacturing catalog, not commercial cards.
- [Gelato Product Search](https://dashboard.gelato.com/docs/products/product/search/):
  `attributeFilters` use actual attribute/value IDs; results contain exact product
  UIDs, source attributes, dimensions and optional country lists; attribute hit
  counts can include broader manufacturing classes.
- [Prodigi catalog/variant API](https://www.prodigi.com/print-api/docs/):
  preserve parent products, bounded variant pages and reported combinations.
  Prodigi is not assumed to implement Gelato's attribute-filtered search.

## Definitions and validation

`lib/productCatalog/presentations.js` is the provider-independent rules module.
Each definition includes a stable JBU ID, rule version, provider/catalog binding,
bilingual name/description/material summary, configurable concepts, fixed source
filters, eligibility rules, image provenance and capabilities. Snapshots preserve
the definition as selected, including its rule version and exact source identity.
No supplier UID allowlist or UID concatenation determines configuration identity.

For Posters, observed unified stock attributes define five *possible* material
rules: 170/200 gsm uncoated, 170/200 gsm silk coated and 250 gsm off-white archival.
These are not five guaranteed live products. GSM/lb-cover equivalence comes from
the supplier's actual combined stock IDs/titles. Only corresponding raw PaperType
values **present in the source definition** become filters. Lb-text is never
silently substituted for lb-cover. Other or unrecognized stocks are not guessed.

A presentation card appears only when its targeted, bounded Product Search page
contains a qualifying candidate. Cards/other unrelated product classes, conflicting
or unknown explicit product families, non-published/deactivated/variable candidates
and unsupported specialty finishing do not satisfy poster rules. Family signals
veto inappropriate bindings; paper rules must also match actual source attributes.
Opaque poster IDs can qualify from catalog/material evidence without being parsed
or constructed. Sources that cannot establish that evidence stay unavailable.

Other supported Gelato categories and Prodigi parents share the definition and
configuration contract. Where the source exposes frame/substrate materials, those
are distinct definitions. Unknown marketing constructions are not invented. Material
definitions use the returned source options without a fixed card-count cutoff; it is not a promise
of the complete supplier storefront. Prodigi discovery requests five parent records per metadata page; the complete-discovery workflow traverses these pages internally before claiming coverage.

## Discovery, relevant fields and dependent choices

- `nativeDiscover({provider})` returns categories and no generic catalog cards.
- `nativeDiscover({provider,category,country,offset?})` returns verified presentations.
  Gelato makes one targeted search of at most 25 products per material definition,
  without automatically paging or creating sync runs. Category metadata uses the
  existing optional private cache; browsing creates no products, candidates or maps.
- `nativeConfigure` and `nativeResolve` now require `presentationId` in their HTTP
  contracts, along with provider/catalog/country and the existing selection fields.
  `addNativeCandidate` carries the same identifier and revalidates the definition.
- Configuration projects only relevant size/orientation/paper/finish/frame/substrate
  concepts. Source PaperFormat is preferred over UnifiedPaperFormat; PaperType is
  preferred over UnifiedPaperType. Alternate vocabularies remain in advanced details.
  Exact source sizes are not collapsed by a guessed inches/mm equivalence.
- A stock fixed by the presentation appears as material summary, not a second paper
  selector. Source attributes with only one defined value are labeled fixed values;
  a dependent selector narrowed to one result remains changeable after reset.
- Allowed selector values come only from **matched candidate combinations on the
  current filtered page**. Global supplier facets cannot reintroduce `cards_` sizes.
  This scope and explicit Next pagination are visible. Absence on this page is not
  represented as global unavailability. No Cartesian combinations are generated.
- Changing an earlier option resets later choices. Empty combinations name the
  selected incompatible fields and offer reset/change. Unknown attributes and attempts
  to override fixed stock/technical fields are rejected by the server.

The ordinary screen does not display State, ProductStatus, ProductModel, Variable,
ColorType, raw UIDs or the complete source schema. Optional advanced sections retain
catalog/attribute IDs, version fingerprints, fixed filters, original technical
attributes and exact selected UID. Existing private canonical provider specifications
remain available for audit and fulfillment.

Cards show bilingual commercial characteristics, sizes verified in the returned
page, provider and Configure action. Current source image references have no verified
commercial license; the UI displays an explicit authorized-photograph-unavailable
placeholder. Illustrative artwork mockups remain clearly labeled as JBU previews.

Artwork orientation/aspect ratio/pixel resolution inform advisory orientation labels
and existing DPI/crop/border guidance. Aspect-ratio mismatch never removes a legitimate
supplier candidate. No preview certifies a production asset.

## Saving and compatibility

The existing Add → save draft → Product Manager path remains. Add forces fresh
source definition/filter search and exact product verification. A forged UID from
a different presentation cannot be selected merely because the catalog returned it.
Candidate snapshots freeze the commercial definition, source metadata and exact
manufacturing UID. The existing save RPC creates selected JBU drafts and disabled
provider mappings. Commercial size/paper/frame attributes, including fixed material,
are projected from the snapshot; technical metadata remains private.

No migration is required. Existing products, publication rules, prices, mappings,
order/payment flows and historical snapshots are not rewritten. Legacy native and
indexed snapshots still resume/save through their existing compatibility paths.
No exhaustive synchronization, scheduled run, supplier order, deployment or merge
is introduced. Rollback is a code revert; source cache records contain definitions,
not commercial rule objects, and existing snapshot versions remain immutable.

## Validation and remaining acceptance

Node tests exercise observed card exclusion, versioned stock rules, duplicate-field
suppression, typed/fixed selector validation, dependent combinations, polluted facets,
Prodigi differences, exact identities and changed/forged configurations. PGlite tests
run the existing migrations and real service/save RPC to verify no browsing writes,
selected-only draft creation, exact disabled mappings, persisted paper values and
commercial snapshots. Existing commerce/historical preservation tests remain.

The browser harness exercises framed and Posters configurations in English desktop
and Spanish mobile, including the existing seven stages, named Industrial Pulse
scenario, technical-field exclusion, cost request, Retry and saving. The successful
poster products/prices are simulated; the observed real cards are exclusion fixtures.

Live acceptance still needs a credentialed preview search returning a qualifying
poster for the chosen stock, its exact manufacturing cost and save readback. If the
real provider returns only unrelated classes or a rule cannot be established from
its attributes, no presentation is fabricated to match a marketing website count.
