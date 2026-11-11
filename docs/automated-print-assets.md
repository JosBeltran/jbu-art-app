# A2 and A1 print assets

## Repository audit

| Existing feature | Extension |
| --- | --- |
| `artworks` and `artwork_prints` | A print variant still belongs to one artwork. Generated previews use the existing `image_url` and the existing title, description, size, paper, price, edition and activation fields. |
| Artwork editor and `/admin/prints` | The artwork's print section gets the generator. Its result links to the exact print record in the existing manager for pricing and activation. |
| Artwork gallery, provenance and images | The generator reads the saved primary photo, a gallery image, or public provenance already attached to the artwork. It also accepts a private staged upload. Sharp, the project's image library, handles rendering. |
| `/prints`, catalog, series and account | The existing public route and promotional metadata stay in use. Its collection now shows one card per available variant. Artwork visibility still follows shared discovery rules. The account and checkout keep their existing variant contracts. |
| Carbon and localization | Carbon forms, notifications and filters reuse JBU's existing theme and ES/EN provider. Public desktop and mobile navigation use the same ordering. |

## Implementation and output

The admin route verifies the separate admin role, resolves a source belonging to the artwork, and rejects unsupported files, external URLs, or insufficient resolution. The server renders both images and uploads them before committing the draft or confirmed replacement. The database serializes changes against the artwork and checks the expected asset revision. A repeated request returns the saved result. If an upload or a confirmed database write fails, the server attempts to remove its new files. It leaves files in place if the result of the database write is unknown.

| Format | Paper dimensions | Portrait canvas at 300 DPI |
| --- | --- | --- |
| A2 | 420 × 594 mm | 4,961 × 7,016 px |
| A1 | 594 × 841 mm | 7,016 × 9,933 px |

Landscape source images use the corresponding landscape canvas after EXIF orientation. The sRGB JPEG contains the full image, centered with a minimum 10 mm white margin by default. Prodigi lists 300 DPI as optimal for Enhanced Matte Art. JBU's effective DPI is the lower of the source pixels divided by the actual artwork width and height in inches. It is calculated after fitting the artwork to the paper, independently of the JPEG's output density. The previous generator calculated effective DPI at full coverage and rejected it immediately below 240. It did not try a smaller placement. [Enhanced Matte Art 200 gsm](https://www.prodigi.com/products/prints-and-posters/art-prints/enhanced-matte-art/)

- **Maximum quality** shrinks the artwork as needed for the JBU target of 240 effective DPI.
- **Balanced** uses the largest placement at the selected target. The defaults allow 150 to 240 effective DPI, starting at 180.
- **Maximum paper coverage** fits inside the minimum borders and requires confirmation below the configured maximum-quality target.

The private preview shows the oriented source pixels, actual artwork dimensions, margins and effective DPI. Generation checks the preview fingerprint against the current source and computed layout. The public preview uses the same gray-background WebP rendering as the private preview, up to 808 px. The final JPEG can be 150, 240 or 300 DPI. If the chosen output density would require upscaling the source raster, the admin must explicitly authorize interpolation or choose a lower output density or a larger margin. Interpolation does not increase the calculated effective DPI.

Server configuration uses `PRINT_LAYOUT_QUALITY_DPI`, `PRINT_LAYOUT_BALANCED_MIN_DPI`, `PRINT_LAYOUT_BALANCED_DPI`, `PRINT_LAYOUT_MIN_BORDER_MM`, and `PRINT_LAYOUT_SMALL_AREA_PERCENT` (defaults 240, 150, 180, 10 and 25). Actual artwork dimensions, borders and output density are stored with each new private asset generation. Earlier generations retain their recorded DPI.


Masters live in the private `print-masters` bucket under `{artworkId}/{size}/{requestId}/{attemptId}/master.jpg`. Only authenticated admins can request a five-minute signed download. The public WebP uses the existing `artworks` bucket under `print-previews/`. The private `print_asset_generations` table links files to a print variant, tracks provenance and retains prior revisions. Private paths never enter storefront or cart data. A previously uploaded source must be uploaded again for a new generation. An abandoned staged upload can remain under `print-masters/staging/`; clean up abandoned uploads through the Storage API after the signed upload has expired. Replaced versions are retained because an existing order may still refer to their previews.

New prints default to an inactive Open Edition with an unset price. The migration allows an unset price on drafts and requires a price for active rows. An optional price can be entered on generation. A confirmed replacement changes the master and public image while keeping pricing, edition and inventory. The generator never copies an artwork or places an order with Prodigi.

## Deploy

1. Apply `supabase/migrations/20261125_print_asset_generation.sql` and then `supabase/migrations/20261126_print_asset_layout.sql` after the Fine Art Prints Manager migration. If the generator is already installed, apply only the latter migration before deploying this update. Confirm the existing `artworks` bucket can serve WebP previews and the new `print-masters` bucket is private.
2. Deploy with the existing Supabase service-role configuration and the canonical public site URL. Verify that the deployment supports the configured 120-second Node route and that Supabase accepts 50 MiB objects in the master bucket. Input files are capped at 25 MiB.
3. In staging, generate A2 from a saved primary photo and A1 from an uploaded original. Open the signed JPEG, check its dimensions and margins, and verify the original source upload is private. Enter a price and activate the draft in the Prints Manager.
4. Confirm the exact preview is visible on the artwork, the public collection and cart. Exercise Open Edition guest and Limited Edition collector checkout in Stripe test mode.
