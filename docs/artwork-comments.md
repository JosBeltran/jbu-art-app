# Artwork discussions

## Audit

Artwork detail already resolves versions by their own artwork ID, uses
`artwork_images` for ordered gallery media, and has separate public views for
provenance images and older provenance event covers. Prints already have a
variant ID. The discussion scope uses those IDs, the artwork's primary image
slot, or the stored URL for an image that only exists in the old secondary
image array. Display optimization and reordering preserve the keys. Replacing
a legacy URL itself creates a different scope; a gallery row keeps its scope
when its file changes. Historic versions retain their own comments.

The existing Supabase client, OAuth callback and return handling support
Google sign-in. The discussion-specific return uses an artwork path and a
validated discussion query. Drafts stay in the tab's session storage. The
visitor sees the draft and submits explicitly after sign-in. The application
reuses a verified existing session and requests Google's OpenID, email and
profile scopes when a new sign-in is needed. The public projection uses the
display name and a Google-hosted avatar where available. Email addresses are
omitted, and comments containing recognizable email addresses are rejected.
Collector consent and purchase pages retain their existing routing.

Moderation uses the existing separate `user_roles` authorization and private
notification outbox. The admin views and artwork UI use Carbon components,
theme tokens and Spanish and English copy. Comments use no currency logic.
The public client shell, artwork pages and cookie settings no longer load
or control Tidio. Existing contact and support routes remain available.

## Behavior and access

- Private tables have RLS enabled with no direct browser grants. The public API
  first verifies the artwork and context using the anonymous role, then reads
  a narrow projection. Verified authors also see their own pending posts.
  Staff identities, rejection reasons, participant status and reports stay private.
- New participants start in review. Two human approvals confer automatic
  publication by default. The threshold and global review override are
  configurable. Rejection requires future review until an admin restores the
  participant. Restoring restarts the approval count. Explicit restrictions
  and blocks remain in force until an admin changes them.
- The database serializes submission and moderation per participant. The
  default hard limit is five comments per ten minutes; a third post within a
  minute is held for review. Repeated messages, suspicious HTML, risky URLs
  and configured phrases are held. URLs are rendered as plain text. With
  links disabled, a moderator must enable links before publishing a comment
  that contains one.
- Replies are one level deep. Hiding or deleting a root removes its thread
  from public reads. Studio notes are published with a distinct artist label
  and can be pinned. Deleting a comment redacts its text and public identity
  while preserving moderation history.
- Reports require an authenticated session, are deduplicated per reporter and
  comment, and are capped at ten per hour. Admin notifications contain a
  reason category and a link to the review screen, with no comment text.
- A global or per-artwork switch closes the discussion. The administration
  navigation displays a pending count.

## Deploy and verify

1. Apply `20261129_artwork_comments.sql` after the artwork version and
   print migrations, then deploy the application.
2. In Supabase Auth, confirm the existing Google provider and
   `/auth/callback` redirect URL are enabled for the deployment domain.
3. Check that the studio's admins have `admin` in `user_roles`. Open
   **Admin → Comentarios** to configure moderation or disable it for a SKU.
4. In staging, use a fresh Google identity on a mobile viewport. Draft a
   comment on an image and verify the return lands in that same context.
   Submit explicitly and verify only its author can see it before moderation.
   Approve it from a separate admin session and confirm it appears publicly.
5. Repeat with a print option, a provenance image and a historical version.
   Check existing guest and collector checkout and verify the artwork
   page makes no request to the retired chat provider.
