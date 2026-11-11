# Facebook Page integration — initial rollout

## Configuration
Required server-only Vercel environment variables:
- `META_APP_ID` (informational)
- `META_GRAPH_API_VERSION` (e.g. `v27.0`)
- `META_TEST_PAGE_ID`
- `META_TEST_PAGE_ACCESS_TOKEN`
- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`

The production website URL may be set using `NEXT_PUBLIC_SITE_URL`; absent that setting the app uses `https://josuebeltranuresti.com`.

**Never put a Page access token in NEXT_PUBLIC-prefixed variables, localStorage, Git, or client state.**

## Required first-time setup
1. Apply `supabase/migrations/20261130_facebook_page_posts.sql` in Supabase before enabling publishing.
2. Ensure Vercel has the environment variables in the environment being deployed and redeploy.
3. Sign in as an administrator and open `/admin/facebook`.
4. Select **Paguina Para Probar**, choose an artwork, and write the message.
5. Keep **Publish now** unchecked. Confirm and create an unpublished post.
6. Verify the returned Facebook post ID and the Supabase history row. Only then test public publishing on the test page.
7. To publish to the main page, select it explicitly and confirm again.

## Scope
Phase 1 sends a text + link feed post. The artwork's public Open Graph preview controls the image. It does **not** upload a photo or choose a print-variant image. Subsequent phases can add variant-specific links, image uploads, scheduling, and analytics.

Meta may reject link posts, app permissions or tokens depending on the app's mode and the Page. The endpoint returns sanitized error codes to the browser; consult server logs and Meta's app settings if necessary.

## Idempotency / recovery
A Facebook post can be created while database insertion fails, because Meta and Supabase cannot share an atomic transaction. In this case the endpoint returns `facebook_post_created_save_failed` and `facebookPostId` so the operator can reconcile the post manually. Do **not** blindly retry because this could create duplicates.

## Operational limitations
- Posts are created from the admin panel, not from personal Facebook profiles or groups.
- Graph metrics, comment moderation, scheduling, picture upload, and token rotation are not included in phase 1.
- Before production rollout, confirm tokens are suitable for unattended server use and test their expiration/permissions.
- The admin history reports only records successfully persisted locally, not a complete Facebook Page post list.
