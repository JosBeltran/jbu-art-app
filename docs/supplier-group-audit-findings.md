# Gelato staged group audit: commercial grouping fails acceptance

Source: user-provided `Supabase Snippet Supplier Catalog Group Audit Export.csv`, SHA-256 `644f9546bfdbda880c85406be308bea6321068199566a77b2a9e118ab98a438e`.

This is read-only analysis of an uploaded export from run `44ab91a4-9973-4b5f-9ad6-9e604b42d33a`. No Supabase mutation, source refetch, checkpoint reset, regrouping or deployment was performed. CSV cell contents were treated as data, never instructions. The export contains group aggregates and at most three sample UIDs per group, not all original variant payloads.

## Observed counts

| Stored family | Group keys | Indexed variants |
| --- | ---: | ---: |
| framed_print | 772 | 11,600 |
| poster | 11 | 116 |
| framed_canvas | 9 | 702 |
| canvas | 7 | 704 |
| acrylic | 2 | 144 |
| Total | 801 | 13,266 |

- 629 framed-print groups have only two variants, typically the two orientations of a manufacturing configuration.
- 458 groups share the title `Pósteres enmarcados · Madera`; 266 share `Pósteres enmarcados · Aluminio`.
- 724 of the 772 framed-print groups do not include paper in their normalized construction metadata, despite visible paper specifications in sample UIDs. This does not prove different papers were merged: the fallback identity still retains many raw paper tokens. It does prove the commercial descriptors are incomplete.
- No group reports more than one stored family/construction value. That is insufficient validation: those values were produced by the same incomplete normalizer.
- No variant reports missing physical dimensions. The export does not contain the measurements themselves, so their accuracy cannot be verified from this field.

## Reproduced defects using actual sampled UIDs

### Frame color incorrectly affects product identity

These two source records differ only in `black` versus `natural-wood`:

```text
framed_canvas_wood_w14xt32-mm_11x14-inch_hor_black_13x16-inch_wood-fsc-2-cm_canvas_4-0_canvas-mounting
framed_canvas_wood_w14xt32-mm_11x14-inch_hor_natural-wood_13x16-inch_wood-fsc-2-cm_canvas_4-0_canvas-mounting
```

The export places them in different groups:

```text
gelato:framed_canvas:1dd08b7247fd1f62adc890a4689de410
gelato:framed_canvas:870183b462daaf079ca5c8d2c409202d
```

Calling the current `gelatoSeries` parser on the source strings reproduces distinct series because positional colors remain in the series. Its known `frc_<value>` parser does not cover this UID shape. These should be selectable frame-color variants of the same reported construction, not separate cards.

### Bare standard sizes incorrectly affect product identity

```text
fine_arts_poster_geo_simplified_product_12-0_hor_a2_200-gsm-80lb-enhanced-uncoated
fine_arts_poster_geo_simplified_product_12-0_hor_a3_200-gsm-80lb-enhanced-uncoated
```

The exported groups are respectively:

```text
gelato:poster:240e8f515ea9c81d2ac6c1a839189154
gelato:poster:4c36288a89794f6fa5d2144096c236e8
```

The current parser leaves bare `a2`/`a3` in the series and extracts no size for these samples; only prefixed `pf_A3` is recognized as a standard format. The same export also contains mixed labels such as `a4-8x12-inch`, `8x12-inch-a4`, `280x430-mm-xl` and `xl-280x430-mm` outside the strict bare-dimension matcher. Merely increasing synchronization coverage will not correct these identities.

### Descriptors and category are incomplete

The Fine Art source catalog's 11 sampled groups are classified as generic `poster`, not the available `fine_art_print` category. Their positional `fine_arts` form is not handled by the current singular Fine Art matcher. Canvas entries with different stretcher identifiers (`wood-fsc-2-cm`, `wood-fsc-3-cm`, `wood-fsc-4-cm`, slim/thick) have empty construction metadata. Framed entries expose frame profiles such as `w12xt22-mm` or `w14xt42-mm` in their UIDs without corresponding construction descriptors. These distinctions must remain available when grouping is corrected; there is no evidence supporting their removal.

## Disposition for recovery PR

The uploaded export closes the previously missing audit input: **the 801 keys cannot be accepted as 801 validated commercial products**. It demonstrates over-segmentation and incomplete metadata. It does not establish a correct final group count or prove every key is wrong. Do not force a target of 34, combine everything sharing a title, or collapse wood/aluminum into one product each.

The synchronization reliability fixes remain independently useful, but successful source exhaustion/atomic revision activation must not be represented as commercial grouping acceptance. Keep commercial acceptance blocked on this finding. Production code remains unchanged by this analysis; if the deployed old worker is still advancing, this report does not pause it or introduce a runtime activation hold.

A safe grouping correction must cover the observed prefixed and positional UID schemas, take structured attributes first, preserve exact IDs and real option combinations, and retain paper, mounting, frame-profile and stretcher construction distinctions. It must include regressions based on these actual samples.

Changing only the parser for future supplier pages is unsafe for this in-progress revision: already staged rows retain old keys and would coexist with newly normalized keys. Correcting the existing revision therefore needs a bounded, resumable local re-normalization pass over its saved raw records, preserving the source checkpoint, page counter, original supplier IDs, candidate snapshots and commercial mappings. This can use persisted records and need not restart or redownload the 13,266 variants. The export alone is not a full raw-record source for that pass. No such data rewrite or parser switch is included in this audit-only follow-up.
