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

Landscape source images use the corresponding landscape canvas. The sRGB JPEG contains the full image, centered with either a minimum 10 mm white margin or only the white space left by proportional fitting. The source must supply at least 240 effective DPI at the fitted size. That limit is a JBU policy. A separate WebP uses a gray background with a maximum side of 808 px. [Prodigi image guidance](https://www.prodigi.com/faq/images/) · [Enhanced Matte Art 200 gsm](https://www.prodigi.com/products/prints-and-posters/art-prints/enhanced-matte-art/)

Masters live in the private `print-masters` bucket under `{artworkId}/{size}/{requestId}/{attemptId}/master.jpg`. Only authenticated admins can request a five-minute signed download. The public WebP uses the existing `artworks` bucket under `print-previews/`. The private `print_asset_generations` table links files to a print variant, tracks provenance and retains prior revisions. Private paths never enter storefront or cart data. A previously uploaded source must be uploaded again for a new generation. An abandoned staged upload can remain under `print-masters/staging/`; clean up abandoned uploads through the Storage API after the signed upload has expired. Replaced versions are retained because an existing order may still refer to their previews.

New prints default to an inactive Open Edition with an unset price. The migration allows an unset price on drafts and requires a price for active rows. An optional price can be entered on generation. A confirmed replacement changes the master and public image while keeping pricing, edition and inventory. The generator never copies an artwork or places an order with Prodigi.

## Deploy

1. Apply `supabase/migrations/20261125_print_asset_generation.sql` after the Fine Art Prints Manager migration. Confirm the existing `artworks` bucket can serve WebP previews and the new `print-masters` bucket is private.
2. Deploy with the existing Supabase service-role configuration and the canonical public site URL. Verify that the deployment supports the configured 120-second Node route and that Supabase accepts 50 MiB objects in the master bucket. Input files are capped at 25 MiB.
3. In staging, generate A2 from a saved primary photo and A1 from an uploaded original. Open the signed JPEG, check its dimensions and margins, and verify the original source upload is private. Enter a price and activate the draft in the Prints Manager.
4. Confirm the exact preview is visible on the artwork, the public collection and cart. Exercise Open Edition guest and Limited Edition collector checkout in Stripe test mode.
