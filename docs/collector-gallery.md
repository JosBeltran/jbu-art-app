# Collector Gallery

The homepage displays approved, published installation photos. The admin side navigation opens Collector Gallery. Collectors can submit from /collection. A photo can be linked to a verified currently owned original or a paid physical edition. Unlinked submissions still require authentication and moderation. Public attribution uses the category only.

## Migration and deployment

1. Apply `supabase/migrations/20261206_collector_gallery.sql` after the existing physical edition migrations using the project's Supabase migration process. Apply it to staging before deploying the preview that uses it. Verify the private `collector-gallery` bucket and its restrictive policy. The server uses the existing Supabase public URL, anon key and server-only service-role key.
2. Deploy the preview and give moderators an existing separate Admin role in Supabase. Confirm the Node.js runtime can load the project's existing Sharp dependency. The app accepts uploads up to 4 MiB.
3. In a trusted shell pointing to the target Supabase project, run `node --env-file=.env.local scripts/import-collector-gallery.mjs`. The script verifies the four pinned Git blobs, preserves their exact downloaded originals privately, and generates metadata-stripped display copies and thumbnails without cropping. The app reads only Supabase Storage. Run the import twice to check four entries and four skips on the second run. A removed legacy entry retains its source record so a rerun cannot recreate it.
4. Review the four drafts individually in Admin. Verify permission for the original photo and depicted private space, then add accurate captions in both languages. Confirm rights, approve, and publish explicitly.

## Tests and manual QA

Run `node --env-file=.env.test.local --test tests/collector-gallery.integration.test.mjs` against disposable staging fixtures. Set `GALLERY_TEST_ORIGIN` to the deployed app, `GALLERY_TEST_ADMIN_TOKEN` and `GALLERY_TEST_COLLECTOR_TOKEN` to short-lived access tokens, and `GALLERY_TEST_OWNED_ARTWORK_ID` to a currently owned original for a fresh test collector with an unused rate window. Use the staging Supabase URL, anon key and service key. Set `GALLERY_TEST_LEGACY_IMPORT=1` to also test the real four-photo import on staging with no reviewed legacy entries. The suite skips when required fixtures are missing and intentionally writes staging test data.

- On a phone and desktop, switch ES/EN and light/dark. Verify layout, natural proportions, captions, contrast, thumbnail failure fallback, and no gallery when there are no published photos.
- Use Tab, Shift+Tab, Enter, Escape and a screen reader. Verify labeled thumbnail controls, focus containment in the lightbox, return focus to the thumbnail, and operation at 200% zoom.
- Upload a historical image, edit its captions, category, optional Artwork ID and order, feature and unfeature it, and confirm each change. Approve and publish, then hide or unpublish. Verify the public listing and direct photo endpoint immediately deny later requests.
- Submit through a collector account. Try JPEG, PNG, WebP, an oversized photo, mislabeled content and an artwork owned by someone else. Confirm that a pending transfer is ineligible for verified linkage. Check that missing consent blocks submission, and that titles and image files contain no unintended personal details before approval. For a paid physical edition check that its artwork appears in the selector.
- Reject one pending entry. Publish another, then withdraw as its submitting collector. Confirm withdrawal cannot be reversed by a moderator and that the moderator can finish the removal request by deleting the stored photo. Verify moderation audit rows. Verify anonymous and collector clients cannot read draft objects directly from Storage.
- Smoke-test existing artwork discovery, print purchase, checkout, certificates and collector transfer in the preview.
