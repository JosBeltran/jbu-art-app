# Tidio Live Chat

## Integration
- Existing `ClientLayout` already mounts `TidioChat` once inside the language and cookie providers. No layout, page design, header, footer, navigation or commerce flow was changed.
- `next/script` loads `https://code.tidio.co/mjed9cy4yfk1dqg5dnt5xr89ii0dosqx.js` with `afterInteractive`, only after optional marketing/chat consent. Admin does not load it; navigation to Admin hides an already-loaded widget.
- Replaces the previous fallback key and removes the pinned vendor-render fallback. The official loader includes account configuration and must not be bypassed. The old `NEXT_PUBLIC_TIDIO_PUBLIC_KEY` value is no longer read, so a stale Vercel variable cannot override the supplied account.
- Necessary-only/no choice: no Tidio request, no widget. Withdrawing consent retains the existing full reload to unload third-party code. Provider load/API errors never block the site.

## Configure in Tidio
1. Verify that this public script belongs to the intended studio account; enable the widget for `www.josuebeltranuresti.com` (and any review domain needed for testing).
2. Configure ES/EN widget translations and launcher text: **Habla con el estudio** / **Chat with the studio**. Availability/offline messages and inbox delivery are managed by Tidio.
3. The site sets `document.tidioChatLang` before initial loading. Tidio does not document a live language-switch API: an existing widget may retain its initial language until a page reload. No forced reload is added for language changes; context language updates immediately.
4. In **Settings → Contact Properties**, create text properties with these exact keys before using context:
   `artwork_id`, `artwork_title`, `artwork_sku`, `artwork_slug`, `artwork_series`, `artwork_artist`, `artwork_dimensions`, `artwork_price`, `artwork_currency`, `artwork_url`, `current_url`, `current_language`, `referrer`, `utm_source`, `utm_campaign`.
5. These are latest-view context properties, not immutable per-message history. Empty strings clear previous artwork context when leaving detail pages. `artwork_artist` stays blank unless an explicit public `artist_name` is supplied; it never reads collector names or assumes authorship. The current detail query has no explicit author join, so that field remains an extension point rather than a guessed name.

## Privacy
- No email, user ID, buyer/owner identity, contact details, session data or visitor identification API.
- URLs exclude query strings and fragments; referrer is origin-only. Only constrained UTM source/campaign labels are allowed.
- Price/currency use the existing shared commerce rule: blank for SOLD, unavailable or CONTACT_FOR_PRICE. Leaving a detail page clears artwork properties.
- Review the cookie-policy text and Tidio's actual cookies/data processing obligations for your account. No consent bypass is introduced.

## Verification / activation
- No database migration or private key required. Deploy this branch through the existing GitHub/Vercel workflow.
- Automated tests cover consent, Admin exclusion, readiness, safe context and price privacy. Browser checks use the real components and Next script loader with an isolated provider harness; they are not proof of production account delivery.
- After deployment, accept marketing/chat cookies, open Home/catalog/artwork/About/How it works, send a real message, confirm it in the intended Tidio inbox and reply. This last test requires the studio's Tidio account and remains unverified from this workspace.
- Official references: https://developers.tidio.com/docs/widget-code-snipets ; https://developers.tidio.com/docs/widget-contact-properties ; https://developers.tidio.com/docs/widget-listeners-events ; https://developers.tidio.com/docs/widget-other-methods .