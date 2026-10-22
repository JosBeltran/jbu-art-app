<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Built-in outdoor promotion presets live in lib/promo/presets.js; render CLIXMEDIA through its native canvas branch and timeline so existing presets remain unchanged and its last four seconds stay static.
- Keep historical Admin READY FOR CLAIM eligibility in lib/adminReadyForClaim.js and enforce it in the list's server query; this isolates operational rules from shared sale and certificate eligibility.

- Public discovery uses getArtworks and the shared effective Series predicate; direct SKU and certificate routes remain separate to preserve preview and verification access.
- Certificate reads share the explicit artwork-to-profile FK join and normalization; transactional RPCs recheck the locked profile name so immutable snapshots cannot capture a stale or missing linked author.
- Admin order operations use a server API with verified separate-role authorization, an operational-field allowlist, and persisted-row readback; never infer success from an error-free zero-row update.
