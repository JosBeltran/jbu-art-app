# JBU UI inventory and individual source review register

**Review:** 2026-11-11. **PR head:** `683ca4398b5d2b16903121df445b92f757619abc`. **Current main:** `8c25490` (full SHA recorded in the audit). Source reviewed in a local integration of these snapshots; Git found no merge conflicts. Application differences from main remain in the two original patched files; WelcomePromoModal subsequently received the narrowly scoped DS-34 lifecycle correction. The refreshed source manifest hashes the corrected file; other source rows remain the original source-review snapshot.

## Coverage and evidence limits

- Original 141 JSX/TSX paths: 138 still exist; 3 were removed on main. All 117 previously PENDING paths are accounted for: 115 received current-source review and 2 retired chat components were inspected at the PR head. The deleted PrintVariantsManager was already in the original reviewed 24.
- Current app/components JSX/TSX: **157 individual source reviews**, including 19 additions since the original snapshot. No current UI row remains PENDING for source inspection.
- Expanded scanner scope also includes 14 JS route/layout wrappers, context/CartContext.jsx and lib/social/render.server.jsx: **173 entries**. These are not 173 interactive components.
- **58 CSS files** individually reviewed (original 56 plus PrintManager and Discussion); no SCSS/Sass files found in these source roots. **78 route/layout entries** include root page/layout; v1 scanner reported 76 by omitting those two.
- Each row below records a focused review of presentation markup, Carbon APIs, relevant effects/accessibility hooks and associated styling. It is not a business-logic correctness or security review. Scanner counts are lexical leads, not the basis of an inferred compliance score.
- Evidence levels are kept separate: source findings in the row; rendered observations only in JBU_CARBON_AUDIT.md and evidence/browser-observations.json. All unexercised interaction/state/assistive-technology checks remain unverified, including authenticated collector/admin forms.
- Reproducible source hashes and raw lexical flags: [source-inventory.json](evidence/source-inventory.json). No A/B/C/D/E percentages or application-wide compliance rating are assigned.

## Current JSX/TSX source register

“Prior” records original source-review status; “changed” means main modified this path after the PR fork. This status does not imply runtime coverage. Line numbers within notes refer to the integrated source; repository-relative links open the exact file.

| File | Prior / main drift | Source evidence and remaining check |
|---|---|---|
| [app/(account)/auctions/page.jsx](../../app/(account)/auctions/page.jsx) | PENDING | Carbon Tabs/Tag/InlineLoading; auction cards use labelled links and inline 72px image grid. Extract repeated type/spacing; test long amounts and narrow cards. |
| [app/(account)/collection/page.jsx](../../app/(account)/collection/page.jsx) | PENDING | Delegates to CollectionView; no independent controls. Verify collection, orders and favorites through that shared view. |
| [app/(account)/layout.jsx](../../app/(account)/layout.jsx) | PENDING | Carbon Header/SideNav/actions; 66rem media listener and custom mobile backdrop. Verify Escape/return focus and 768–1055px transition. |
| [app/(account)/notifications/page.jsx](../../app/(account)/notifications/page.jsx) | PENDING | Metadata wrapper for NotificationCenter; no independent interaction. |
| [app/(account)/offers/page.jsx](../../app/(account)/offers/page.jsx) | PENDING | Carbon loading/error/actions around OffersList; inline heading rhythm remains. Verify empty/error states in both themes. |
| [app/(account)/profile/page.jsx](../../app/(account)/profile/page.jsx) | C | Carbon Tabs/ProgressBar/ClickableTile profile; mixed inline styles and Profile module. Preferences remain Carbon Selects; rounded border alone is not a useful whole-screen verdict; test tiles and tab focus. |
| [app/ClientLayout.jsx](../../app/ClientLayout.jsx) | PENDING; changed | Theme g10/g100 wraps CookieConsent/CartProvider and public shell; nested main landmarks arise when route children also render main. DS-15. |
| [app/about/ArtistAbout.jsx](../../app/about/ArtistAbout.jsx) | PENDING | Editorial portrait/biography using JBUPageHeader/Section and links. Justified composition; verify heading hierarchy, portrait alt and contact overflow. |
| [app/about/page.jsx](../../app/about/page.jsx) | PENDING | Server artist-profile loader delegates to ArtistAbout; no independent control replacement warranted. |
| [app/admin/artist/page.jsx](../../app/admin/artist/page.jsx) | PENDING | Carbon TextInput/TextArea/Toggle/Button and ImageUploader. Labelled identity/about/contact fields; inline grid/max-width styles need responsive checks. |
| [app/admin/artworks/[id]/edit/page.tsx](../../app/admin/artworks/[id]/edit/page.tsx) | PENDING; changed | Carbon form plus EnumSelect and native print-image checkbox at line 662. Series Select line 513 has empty labelText; sibling span is not a label. DS-17/18. |
| [app/admin/artworks/components/ImageUploader.jsx](../../app/admin/artworks/components/ImageUploader.jsx) | PENDING; changed | Carbon FileUploaderDropContainer/Button/InlineLoading; alert text and contained preview. Preserve upload behavior; validate keyboard dropzone and progress. |
| [app/admin/artworks/components/VideoUploader.jsx](../../app/admin/artworks/components/VideoUploader.jsx) | PENDING | Carbon file dropzone, URL TextInput and remove Button; alert errors. Validate video controls/alt and narrow preview with ImageUploader styles. |
| [app/admin/artworks/new/page.jsx](../../app/admin/artworks/new/page.jsx) | PENDING; changed | Carbon file upload and registration form; CreateSeriesModal introduces custom unlabelled fields/dialog. DS-17; preserve submission and country field. |
| [app/admin/artworks/page.jsx](../../app/admin/artworks/page.jsx) | PENDING | Carbon DataTable/toolbar/actions; artwork thumbnails and metadata are legitimate table content. Verify horizontal scrolling and row action names at phone widths. |
| [app/admin/auction-events/[id]/page.jsx](../../app/admin/auction-events/[id]/page.jsx) | PENDING | Carbon event form/ComboBox/Modal; cover-image native selector is editorial candidate. Link wraps Button in several actions; replace with Button as Link. DS-20. |
| [app/admin/auction-events/[id]/promote/page.jsx](../../app/admin/auction-events/[id]/promote/page.jsx) | PENDING | Route delegates params to PromotionStudio; no separate controls. |
| [app/admin/auction-events/page.jsx](../../app/admin/auction-events/page.jsx) | PENDING | Carbon Button/Tag/loading; create/open Link wraps Button (nested interactive markup). DS-20; flex-wrap list is responsive intent only. |
| [app/admin/auctions/[id]/page.jsx](../../app/admin/auctions/[id]/page.jsx) | PENDING | Carbon NumberInput/Checkbox/Modal auction form; several Link-wrapped Buttons. DS-20; fieldset disabled/locked states need runtime review. |
| [app/admin/auctions/[id]/promote/page.jsx](../../app/admin/auctions/[id]/promote/page.jsx) | PENDING | Route delegates to PromotionStudio for lot; no separate controls. |
| [app/admin/auctions/page.jsx](../../app/admin/auctions/page.jsx) | PENDING | Carbon auction list/Tag; create/open Link-wrapped Buttons. DS-20. Inline list typography/spacing can be normalized later. |
| [app/admin/certificates/page.jsx](../../app/admin/certificates/page.jsx) | PENDING | Carbon table/loading/notification/actions. Verify request table overflow, status tags and icon descriptions with real rows. |
| [app/admin/claims/page.jsx](../../app/admin/claims/page.jsx) | PENDING | Carbon Checkbox/TextInput and batch feedback; selection rows use containing click targets. Check keyboard selection and 280px grid minimum in Claims CSS. DS-22. |
| [app/admin/collectors/[profileId]/preview/PreviewClient.jsx](../../app/admin/collectors/[profileId]/preview/PreviewClient.jsx) | PENDING | Carbon Accordion/radio/actions; privileged preview warning is explicit. Verify read-only collection tabs without changing authorization. |
| [app/admin/collectors/[profileId]/preview/page.jsx](../../app/admin/collectors/[profileId]/preview/page.jsx) | PENDING | PreviewClient wrapper; data and permission behavior outside design remediation scope. |
| [app/admin/comments/CommentSettings.jsx](../../app/admin/comments/CommentSettings.jsx) | ADDED | Carbon Checkbox/TextInput/TextArea/Tile forms with status feedback. Verify numeric invalid states and per-artwork enable controls; no native replacement needed. |
| [app/admin/comments/CommentsAdmin.jsx](../../app/admin/comments/CommentsAdmin.jsx) | ADDED | Carbon moderation filters, selection, confirmation/reply/history Modals. Many actions require mobile wrapping and focus restoration checks; no publish/moderation actions exercised. |
| [app/admin/comments/page.jsx](../../app/admin/comments/page.jsx) | ADDED | CommentsAdmin wrapper; no independent controls. |
| [app/admin/facebook/page.jsx](../../app/admin/facebook/page.jsx) | ADDED | Carbon Select/TextArea/Checkbox/Button form. Checkbox callbacks treat first argument as boolean; installed Carbon passes event first. DS-23; publishing not exercised. |
| [app/admin/hero/page.jsx](../../app/admin/hero/page.jsx) | PENDING | Redirect to consolidated admin home; no rendered UI to score. |
| [app/admin/home/page.jsx](../../app/admin/home/page.jsx) | C | Carbon home settings compose HeroStudio, delivery and social editors. Inline layout concentration is maintenance debt; check accordion and banner preview. |
| [app/admin/layout.jsx](../../app/admin/layout.jsx) | C; changed | Carbon Header/SideNav; custom backdrop and g100 class string do not establish scoped dark Theme. Verify inherited g10/g100 and responsive focus. DS-11. |
| [app/admin/media/page.jsx](../../app/admin/media/page.jsx) | PENDING | Carbon progress/actions/notifications for media optimization. Preserve operational handlers; validate wrapping/status announcements without running optimization. |
| [app/admin/merchant/page.jsx](../../app/admin/merchant/page.jsx) | PENDING | Carbon diagnostic table/actions for merchant feed; composed edit styles. Source-only review; do not generate/alter product feed behavior. |
| [app/admin/offers/page.jsx](../../app/admin/offers/page.jsx) | PENDING | Carbon ContentSwitcher/loading/notifications around OffersList; check status switching and mobile buttons without accepting offers. |
| [app/admin/orders/page.jsx](../../app/admin/orders/page.jsx) | PENDING; changed | Carbon Tabs, Select, TextInput/TextArea order forms with shared delivery panel. 300px grid minimum risks phone overflow. DS-22; no order transitions exercised. |
| [app/admin/orders/production/PrintProductionQueue.jsx](../../app/admin/orders/production/PrintProductionQueue.jsx) | ADDED | Carbon Pagination/Tile/Tag production queue; Button as Link navigation. Verify pagination labels and error/empty states with isolated data. |
| [app/admin/orders/production/page.jsx](../../app/admin/orders/production/page.jsx) | ADDED | Production queue wrapper; no separate controls. |
| [app/admin/page.jsx](../../app/admin/page.jsx) | PENDING | Admin redirect; no rendered UI to score. |
| [app/admin/prints/PrintManager.jsx](../../app/admin/prints/PrintManager.jsx) | ADDED | New Carbon print editor/filter/Pagination/ComboBox and keyboard editor anchor. Replaces deleted native PrintVariantsManager; DS-03 retired. Verify locked fields/errors, inline editor focus and row wrapping. |
| [app/admin/prints/page.jsx](../../app/admin/prints/page.jsx) | ADDED | PrintManager wrapper; no separate controls. |
| [app/admin/series/[id]/page.jsx](../../app/admin/series/[id]/page.jsx) | C | Carbon series settings plus native main-artwork image selection with aria-pressed. Keep selector as editorial exception candidate; dense inline layout debt DS-06. |
| [app/admin/series/page.jsx](../../app/admin/series/page.jsx) | PENDING | Series redirect to admin home; no separate controls. |
| [app/admin/users/page.jsx](../../app/admin/users/page.jsx) | PENDING | Carbon DataTable/Select/Modal user management. Verify table overflow, role Select names and modal errors; no account changes exercised. |
| [app/artwork/[sku]/ArtworkDetailClient.tsx](../../app/artwork/[sku]/ArtworkDetailClient.tsx) | C; changed | Carbon purchase, print Select and Modal composition; print thumbnails carry aria-pressed at 905. Keep image selection; review specialty lightbox/reveal, generic variant spacing and contrast. DS-09/16. |
| [app/artwork/[sku]/ArtworkDetailPage.jsx](../../app/artwork/[sku]/ArtworkDetailPage.jsx) | ADDED | Server ArtworkDetailPage delegates current/print/historical contexts to detail client. No independent controls; data projections unchanged. |
| [app/artwork/[sku]/ArtworkEngagement.jsx](../../app/artwork/[sku]/ArtworkEngagement.jsx) | PENDING | Carbon Button/Tag artwork engagement; verify toggled favorite state and loading/error announcements without mutating favorites. |
| [app/auctions/[slug]/AuctionEventClient.jsx](../../app/auctions/[slug]/AuctionEventClient.jsx) | PENDING | Carbon auction actions with custom role=tab selector lacking roving tabindex/tabpanel links. DS-19; Link-wrapped bid Button DS-20. |
| [app/auth/callback/page.jsx](../../app/auth/callback/page.jsx) | PENDING | Carbon InlineLoading inside AuthShell; callback view has no generic native form to replace. |
| [app/cart/page.jsx](../../app/cart/page.jsx) | C; changed | Carbon checkout/login feedback but native clear/remove actions at 114/169; routine actions should use Carbon Button. DS-08. Pricing/shipping/checkout handlers preserved. |
| [app/catalog/CatalogClient.tsx](../../app/catalog/CatalogClient.tsx) | B; changed | Carbon Search/Dropdown/ContentSwitcher/Checkbox and mobile Modal filters; cards/series details justified. Duplicate desktop/mobile filter trees require runtime ID/name checks; do not infer failure from source alone. |
| [app/catalog/CatalogHero.jsx](../../app/catalog/CatalogHero.jsx) | PENDING | Editorial CatalogHero uses localized heading/count and LogoJBU; verify decorative mark and long title, no form controls. |
| [app/checkout/cancel/page.jsx](../../app/checkout/cancel/page.jsx) | PENDING | Hardcoded bg-violet/text-white cancellation screen ignores g10/g100, with self-styled navigation CTAs. DS-30. Preserve order redirect/query behavior. |
| [app/checkout/success/page.jsx](../../app/checkout/success/page.jsx) | PENDING; changed | Carbon confirmation/loading/actions; guest pending/error/retry states render editorial text. Verify announcements and long session reference; no Stripe transaction exercised. |
| [app/claim/lote/page.jsx](../../app/claim/lote/page.jsx) | PENDING | Carbon batch-claim Checkbox/Tag/Button feedback; Claim CSS phone breakpoints. Keyboard selection and delivery gating are runtime-unverified. |
| [app/claim/page.jsx](../../app/claim/page.jsx) | PENDING | Carbon labelled claim form/helper/error and checkbox method selection. No native replacement warranted; verify error association and successful focus transition. |
| [app/como-funciona/PlatformScreens.jsx](../../app/como-funciona/PlatformScreens.jsx) | PENDING | Editorial device illustrations use spans, links and artwork data; fake fields/tabs are illustrative, not live native form controls. Do not mechanically convert mockups to Carbon inputs. |
| [app/como-funciona/page.jsx](../../app/como-funciona/page.jsx) | PENDING | Editorial how-it-works sections, real links, heading labels. Custom navigation links are valid; verify focus and contrast of illustrated UI separately. |
| [app/consent/page.jsx](../../app/consent/page.jsx) | PENDING | Carbon consent Button/InlineNotification plus LegalCheckbox/AuthShell; preserve legal/auth behavior and validate error/status announcements. |
| [app/cookies/page.jsx](../../app/cookies/page.jsx) | PENDING | LegalDocument cookies wrapper; no independent controls. |
| [app/guest-orders/[token]/page.jsx](../../app/guest-orders/[token]/page.jsx) | PENDING | Guest order tracking uses InlineLoading and role=alert error; narrow max-width. Verify long identifiers and receipt status without real bearer link. |
| [app/info/InfoPage.jsx](../../app/info/InfoPage.jsx) | PENDING | InfoShell/InfoSections compose JBU editorial headers, nav and CookiePreferencesLink; valid custom editorial links. No blanket Button replacement for navigation. |
| [app/info/layout.jsx](../../app/info/layout.jsx) | PENDING | Information metadata/layout wrapper returns children; no independent controls. |
| [app/info/politica-de-privacidad/page.jsx](../../app/info/politica-de-privacidad/page.jsx) | PENDING | LegalDocument privacy alias; verify through shared legal presentation. |
| [app/info/soporte/page.jsx](../../app/info/soporte/page.jsx) | PENDING | InfoShell/InfoSections support content; editorial contact links justified. Check line length and keyboard focus. |
| [app/info/terminos-de-servicio/page.jsx](../../app/info/terminos-de-servicio/page.jsx) | PENDING | LegalDocument terms alias; verify through shared legal presentation. |
| [app/info/tracking/page.jsx](../../app/info/tracking/page.jsx) | PENDING | Routine tracking input/button at 31–32 are custom native controls. Carbon TextInput/Button migration candidate DS-18; existing label association retained. |
| [app/landing/LandingClient.jsx](../../app/landing/LandingClient.jsx) | D | Custom landing navigation with aria-expanded/controls mobile menu and native theme/logout actions. DS-05; preserve editorial layout and verify Escape/focus/contrast. |
| [app/landing/page.tsx](../../app/landing/page.tsx) | PENDING | Landing redirect; no separate rendered UI. |
| [app/layout.tsx](../../app/layout.tsx) | PENDING | IBM Plex Sans/Serif/Mono variables and Carbon CSS precede globals; server cookie initializes html jbu-dark and ClientLayout. Font download/application needs computed verification. DS-01/14. |
| [app/login/GoogleButton.jsx](../../app/login/GoogleButton.jsx) | PENDING | Google-branded sign-in button/logo uses native button and fixed provider palette. Document external brand exception candidate; verify dark focus selector mismatch. DS-21. |
| [app/login/page.jsx](../../app/login/page.jsx) | PENDING | Carbon TextInput/PasswordInput/login feedback; native recovery/back text actions can use ghost Button. Google branded action exception separate. DS-18/21. |
| [app/orders/[id]/page.jsx](../../app/orders/[id]/page.jsx) | PENDING | Carbon progress/tags/notifications/actions and delivery summary. Editorial order cards justified; 38rem progress strip explicitly scrolls. Verify focus/overflow with real order states. |
| [app/page.tsx](../../app/page.tsx) | PENDING | Server home loader and JSON-LD delegate to LandingClient; no independent interactive markup. |
| [app/prints/PrintCollection.jsx](../../app/prints/PrintCollection.jsx) | ADDED | Carbon print Search/Select/Tag/Button; cards link to individual variants and retain country URL. Editorial image cards justified; test long paper/title at mobile widths. |
| [app/prints/[variantId]/not-found.jsx](../../app/prints/[variantId]/not-found.jsx) | ADDED | Print not-found uses Carbon Button href and localized heading/copy; verify heading/main hierarchy through shell. |
| [app/prints/[variantId]/page.jsx](../../app/prints/[variantId]/page.jsx) | ADDED | Individual print server route delegates to ArtworkDetailPage, not a duplicate component system. Shared print presentation needs detail/gallery checks. |
| [app/prints/page.jsx](../../app/prints/page.jsx) | PENDING; changed | Fine Art Prints editorial header wraps PrintCollection; shares catalog CSS. No separate native form controls. |
| [app/privacy/page.jsx](../../app/privacy/page.jsx) | PENDING | LegalDocument privacy wrapper; no independent controls. |
| [app/reset-password/page.jsx](../../app/reset-password/page.jsx) | PENDING | Carbon PasswordInput and status feedback in AuthShell; verify invalid/link-expired/complete states; authentication unchanged. |
| [app/series/[slug]/page.jsx](../../app/series/[slug]/page.jsx) | PENDING; changed | Series server page shares CatalogClient/styles and localized editorial title. Country/series filters preserved; nested main DS-15. |
| [app/signup/page.jsx](../../app/signup/page.jsx) | PENDING | Carbon signup fields/PasswordInput/LegalCheckbox; Google branding exception candidate. Test invalid/confirmation layouts without creating accounts. |
| [app/terms/page.jsx](../../app/terms/page.jsx) | PENDING | LegalDocument terms wrapper; no independent controls. |
| [app/verify/[sku]/page.tsx](../../app/verify/[sku]/page.tsx) | PENDING | Server certificate lookup delegates to VerifyCertificate; certificate logic untouched. |
| [components/AnnouncementBanner.jsx](../../components/AnnouncementBanner.jsx) | E | Sanitized configurable announcement region with ResizeObserver public height; editorial content justified. Verify wrapped text and fixed header offset. |
| [components/AppThemeProvider.jsx](../../components/AppThemeProvider.jsx) | PENDING | Light default; localStorage overrides initial cookie after mount and jbu-dark updates html. Preference hydration/flash still requires browser state matrix. DS-14. |
| [components/ArtworkImage.jsx](../../components/ArtworkImage.jsx) | PENDING | ArtworkImage alt/responsive delivery is justified media abstraction; missing-image fallback at 59 uses fixed stone palette and loses caller className. Fixture confirms low contrast/light block in dark. DS-27. |
| [components/ArtworkLightbox.jsx](../../components/ArtworkLightbox.jsx) | E; changed | Carbon navigation/zoom/close Buttons and native thumbnail selector; dialog handles Escape/arrows but lacks initial/trapped/return focus. DS-16. Dark photographic stage exception does not exempt dialog semantics. |
| [components/ArtworkQR.jsx](../../components/ArtworkQR.jsx) | PENDING | Carbon download Button/Tag with QRCodeSVG. Fixed white QR substrate justified for scanning; verify accessible QR context and download feedback. |
| [components/AskForPriceButton.jsx](../../components/AskForPriceButton.jsx) | PENDING | Carbon contact/ask-price actions and notification. Verify loading/disabled/link target semantics without sending a message. |
| [components/BuyButton.jsx](../../components/BuyButton.jsx) | PENDING; changed | Carbon buy/disabled Button and PaymentDelivery composition. Existing commerce state remains outside design changes; validate error/disabled announcements only in fixtures. |
| [components/CartDrawer.jsx](../../components/CartDrawer.jsx) | C; changed | Carbon action Buttons with custom backdrop/aside overlay; no Escape, initial/trapped/return focus or dialog semantics in component. DS-16; preserve cart handlers. |
| [components/CartShippingNotice.jsx](../../components/CartShippingNotice.jsx) | ADDED | Carbon InlineNotification for shipping compatibility; source confirms standard feedback. Do not alter country resolution. |
| [components/CertificateActions.jsx](../../components/CertificateActions.jsx) | PENDING | Carbon download/loading and status note; back Link wraps Button. DS-20; certificate artifact generation not exercised. |
| [components/CreateSeriesModal.jsx](../../components/CreateSeriesModal.jsx) | PENDING | CreateSeriesModal is custom div overlay, native fields/actions, fixed violet styling, unassociated sibling labels and no focus/Escape management. DS-17 high priority; preserve insert payload. |
| [components/CurrencyProvider.jsx](../../components/CurrencyProvider.jsx) | PENDING | Currency context plus ExchangeNote text; no routine form controls. Shared display-only currency behavior unchanged. |
| [components/CurrencyToggle.jsx](../../components/CurrencyToggle.jsx) | PENDING | Native currency toggle with accessible name and inline header styling; Carbon action migration candidate DS-18. Currency calculations unchanged. |
| [components/I18nProvider.jsx](../../components/I18nProvider.jsx) | PENDING | Language/localization context provider; no rendered control to classify as compliant/noncompliant. |
| [components/LanguageToggle.jsx](../../components/LanguageToggle.jsx) | PENDING | Native language toggle with accessible name; migrate shared action only if preserving localization behavior. DS-18. |
| [components/MakeOfferModal.jsx](../../components/MakeOfferModal.jsx) | PENDING | Carbon Modal/NumberInput/TextInput/TextArea and notification; standard form composition. Verify nested form submit, Enter and invalid feedback; offer logic untouched. |
| [components/Navbar.tsx](../../components/Navbar.tsx) | B; changed | Carbon Header/HeaderMenu/HeaderGlobalAction/SideNav public navigation; collection links added on main. Custom supporting CSS needs both-theme keyboard/mobile review. Cart overlay is separate DS-16. |
| [components/OffersList.jsx](../../components/OffersList.jsx) | PENDING | Carbon Tag and offer actions with artwork cards; native mail/navigation links justified. Verify action wrapping and status text. |
| [components/PhysicalEditionBuyButton.jsx](../../components/PhysicalEditionBuyButton.jsx) | PENDING; changed | Carbon buy/notification composition; disabled/loading states present. No country, unit selection or checkout changes authorized. |
| [components/PointBoostWidget.jsx](../../components/PointBoostWidget.jsx) | PENDING | Native package-purchase buttons with Carbon notifications; use Carbon action/tile pattern without changing package/price/checkout payload. DS-18. |
| [components/TierProgressBar.jsx](../../components/TierProgressBar.jsx) | PENDING | Carbon ProgressBar/Tag with specialty XP tier display. Success/warning foregrounds need measured contrast, not automatic failure from token names. |
| [components/TopBoosters.jsx](../../components/TopBoosters.jsx) | PENDING | Carbon SkeletonText/Tag for leaderboard; editorial list justified. Verify long names and warning border/text contrast. |
| [components/UserNavbarDropdown.jsx](../../components/UserNavbarDropdown.jsx) | PENDING | Self-styled dark native user menu, trigger lacks aria-expanded and controls. Usage search required before remediation; DS-21 marks component debt, not proven active-route failure. |
| [components/VerifyCertificate.jsx](../../components/VerifyCertificate.jsx) | PENDING | Editorial certificate and QR with native PDF-integrity action; use ghost Carbon Button for routine integrity action. Fixed QR/print white surfaces justified. DS-18. |
| [components/admin/ArtworkVersionManager.jsx](../../components/admin/ArtworkVersionManager.jsx) | ADDED | Carbon version editor/Tile/Checkbox/Select and upload; verify title/notes labels and draft focus. No version lifecycle changes. |
| [components/admin/CertificateOwnershipPanel.jsx](../../components/admin/CertificateOwnershipPanel.jsx) | PENDING | Carbon ownership Modal/radio/text fields; native collector result selector only encodes selection via CSS class. DS-24; use Carbon radio/selection pattern and verify status. |
| [components/admin/HeroStudio.jsx](../../components/admin/HeroStudio.jsx) | PENDING | Carbon HeroStudio Modal/form/uploader and move actions; editorial slide previews justified. Verify modal upload states and keyboard reorder. |
| [components/admin/PhysicalEditionManager.tsx](../../components/admin/PhysicalEditionManager.tsx) | PENDING | Carbon physical edition Select/TextInput/TextArea/Toggle/Button; custom unit table is composition. Verify table overflow and destructive confirmation, preserve edition logic. |
| [components/admin/PrintAssetGenerator.jsx](../../components/admin/PrintAssetGenerator.jsx) | ADDED | Carbon asset generation form/file uploader/Select/Checkbox/actions. Preview/render output is editorial. Verify long policy messages and disabled/invalid states without generating assets. |
| [components/admin/PrintProductionPanel.jsx](../../components/admin/PrintProductionPanel.jsx) | ADDED | Carbon production source/file/checkbox/actions; saved preview/master comparison is specialized media. Verify repeated panel IDs and approval focus; do not generate or approve masters. |
| [components/admin/PromotionalSocialEditor.jsx](../../components/admin/PromotionalSocialEditor.jsx) | B | Carbon social metadata editor and OG preview; token patch retained. Language selector buttons visually encode locale; consider aria-pressed. DS-10. |
| [components/admin/ProvenanceManager.jsx](../../components/admin/ProvenanceManager.jsx) | C; changed | Carbon provenance editor; visibility Select at 112 has empty accessible label. DS-17. Dense inline layout remains DS-07; preview images justified. |
| [components/admin/SeriesHomeList.jsx](../../components/admin/SeriesHomeList.jsx) | PENDING | Carbon Toggle/reorder Buttons and series list; Edit Link wraps Button DS-20. Preserve home ordering and launch rules. |
| [components/admin/ShippingCountriesField.jsx](../../components/admin/ShippingCountriesField.jsx) | ADDED | Carbon FilterableMultiSelect for shipping countries, useMemo localized items. Verify chips, empty selection semantics and keyboard navigation; country rules unchanged. |
| [components/admin/SocialSharingSettings.jsx](../../components/admin/SocialSharingSettings.jsx) | B | Carbon social settings, toggles/Select and shared PromotionalSocialEditor; no native control replacement needed. Verify nested editor IDs/feedback. |
| [components/auction/AuctionEventContext.jsx](../../components/auction/AuctionEventContext.jsx) | PENDING | Specialized auction-context nav with labelled previous/next links and Carbon icons; valid navigation exception. Verify mobile grid and missing-neighbor reading order. |
| [components/auction/AuctionPanel.jsx](../../components/auction/AuctionPanel.jsx) | PENDING; changed | Carbon auction Modal/NumberInput/Button and inline errors; live amount uses aria-live. Verify labels, Enter/confirmation and live updates without bidding. |
| [components/auction/Countdown.jsx](../../components/auction/Countdown.jsx) | PENDING | Custom countdown text role=timer aria-live=off avoids per-second interruption. Justified specialty display; verify readable localized labels. |
| [components/auction/HomeAuctions.jsx](../../components/auction/HomeAuctions.jsx) | PENDING | Editorial auction promotional links/images and countdown; no routine native form controls. Preserve real auction states and check contrast over cover. |
| [components/auction/PendingPayment.jsx](../../components/auction/PendingPayment.jsx) | PENDING | Carbon pending-payment Button/state copy. Check pending/expired/paid labels in isolated fixtures; no payment executed. |
| [components/auth/AuthShell.jsx](../../components/auth/AuthShell.jsx) | B | AuthShell editorial branding and heading/footer wrapper; valid custom composition. Shared form controls live in child routes. |
| [components/auth/OAuthReturnHandler.jsx](../../components/auth/OAuthReturnHandler.jsx) | PENDING | OAuthReturnHandler returns null and handles return navigation; no rendered UI to score, auth behavior untouched. |
| [components/catalog/PromotionalLandingTitle.jsx](../../components/catalog/PromotionalLandingTitle.jsx) | PENDING | Localized promotional h1 with clamp type and semantic text color; editorial typography justified pending zoom/wrap. |
| [components/certificates/PhysicalEditionClaimButton.jsx](../../components/certificates/PhysicalEditionClaimButton.jsx) | PENDING | Carbon certificate claim Button/notification; verify disabled eligibility message without issuing certificates. |
| [components/collection/CollectionRegistry.jsx](../../components/collection/CollectionRegistry.jsx) | PENDING | Carbon Tag plus specialty certificate registry links/data; verify wrapping and current status. No form controls to replace. |
| [components/collection/CollectionView.jsx](../../components/collection/CollectionView.jsx) | PENDING | Carbon Tabs/Button/Tag/feedback for collection, orders, favorites. Shared admin preview is read-only. Verify responsive cards and removal announcements without changing favorites. |
| [components/comments/ArtworkDiscussion.jsx](../../components/comments/ArtworkDiscussion.jsx) | ADDED | Carbon comment TextArea/TextInput/Select/Checkbox/actions, status messages and editor focus. Verify reply/thread announcements/labels and long content; no comments posted. |
| [components/consent/CookieConsent.jsx](../../components/consent/CookieConsent.jsx) | B; changed | Carbon cookie Modal/Toggle/Button inside Theme; banner breakpoint/stacking may collide with bottom nav at 768–1055px. DS-22 runtime hypothesis, not confirmed failure. |
| [components/consent/LegalCheckbox.jsx](../../components/consent/LegalCheckbox.jsx) | PENDING | Carbon Checkbox has hidden accessible label and aria-describedby legal copy; standard pattern. Verify link focus without changing consent records. |
| [components/consent/LegalDocument.jsx](../../components/consent/LegalDocument.jsx) | PENDING | LegalDocument composes InfoShell/InfoSections from shared data; editorial legal content exception. No form controls. |
| [components/delivery/AdminDeliveryOrder.jsx](../../components/delivery/AdminDeliveryOrder.jsx) | PENDING | Carbon operational form/Select/TextArea/notifications; native window.confirm for delivery transitions is separate UI debt. Preserve state handlers; check confirmation only in fixtures. |
| [components/delivery/AdminDeliverySettings.jsx](../../components/delivery/AdminDeliverySettings.jsx) | PENDING | Carbon delivery settings Toggle/TextInput/TextArea/Button; wrap grid at 640px. Check error/invalid helpers without saving settings. |
| [components/delivery/OrderDeliverySummary.jsx](../../components/delivery/OrderDeliverySummary.jsx) | PENDING | Carbon Tag/notification and delivery summary; specialty status composition. Verify long address/timezone text. |
| [components/delivery/PaymentDelivery.jsx](../../components/delivery/PaymentDelivery.jsx) | B; changed | Carbon Modal/radio/address TextInput/TextArea/date/Select and feedback; useId creates per-instance IDs. Validate focus/invalid/date states; no reservation/payment action executed. |
| [components/home/HeroCarousel.jsx](../../components/home/HeroCarousel.jsx) | E | Editorial carousel with reduced-motion, focus/hover pause and arrows. Dots declare tabs without tabpanel links/roving focus; no persistent pause control. DS-19; keep image composition. |
| [components/home/SeriesSections.jsx](../../components/home/SeriesSections.jsx) | PENDING | Editorial series layouts, countdown and teaser videos; CSS supports focus and reduced motion. Verify video pause behavior and long release titles. |
| [components/jbu/JBUEditorial.jsx](../../components/jbu/JBUEditorial.jsx) | PENDING | Shared editorial header/section/step primitives with aria-labelledby. Valid custom content structure; verify unique title IDs when repeated. |
| [components/jbu/LogoJBU.jsx](../../components/jbu/LogoJBU.jsx) | PENDING | SVG LogoJBU uses decorative aria-hidden or named role=img; token palette. Branding exception justified; no form controls. |
| [components/media/ArtworkVideoReveal.jsx](../../components/media/ArtworkVideoReveal.jsx) | PENDING | Cinematic intro honors reduced motion and Escape with skip Button, but custom aria-modal dialog has no focus management. DS-16; fixed dark stage is editorial exception candidate. |
| [components/media/MediaGallery.jsx](../../components/media/MediaGallery.jsx) | E; changed | Native image/video play/zoom/thumbnails are specialized gallery controls; tabs lack roving tabindex/tabpanel relations. DS-19; retain gallery and native video playback capability. |
| [components/media/OptimizedImg.jsx](../../components/media/OptimizedImg.jsx) | PENDING | OptimizedImg image variant/fallback wrapper; alt passed through props. No direct Carbon requirement; verify provided alt at callers. |
| [components/nav/MobileBottomNav.jsx](../../components/nav/MobileBottomNav.jsx) | PENDING | Site-specific mobile nav links/actions, aria-current/expanded and labels. Justified compact navigation candidate; safe-area CSS and focus present, runtime targets unverified. |
| [components/nav/PublicBottomNav.jsx](../../components/nav/PublicBottomNav.jsx) | E; changed | PublicBottomNav composes shared mobile nav and Fine Art Prints links. Check active route and six-item labels at 375px without altering navigation contracts. |
| [components/notifications/NotificationBell.jsx](../../components/notifications/NotificationBell.jsx) | PENDING | Carbon HeaderGlobalAction notification bell with unread count in accessible name; badge aria-hidden. Verify polling updates and focus without marking notifications read. |
| [components/notifications/NotificationCenter.jsx](../../components/notifications/NotificationCenter.jsx) | PENDING | Carbon notification loading/error/mark-read actions and ordered list. Verify live feedback, long dates and narrow row layout with fixtures. |
| [components/promo/PromotionStudio.jsx](../../components/promo/PromotionStudio.jsx) | PENDING | Carbon promotion controls/preview canvas; hidden file input within label at 369 has no keyboard-focusable proxy. DS-25. Canvas/output styling is editorial; retain CLIXMEDIA rules. |
| [components/promo/SeriesReleaseStudio.jsx](../../components/promo/SeriesReleaseStudio.jsx) | PENDING | Carbon Modal/Select/Checkbox/Button release studio with canvas preview; custom grid 280px minimum. Verify 672px modal width and preview alternative; generated art exception. |
| [components/promo/WelcomePromoBadge.jsx](../../components/promo/WelcomePromoBadge.jsx) | PENDING | Promotion badge is read-only editorial status copy using theme module; verify text and white CTA belongs to modal, not badge. |
| [components/promo/WelcomePromoClaimer.jsx](../../components/promo/WelcomePromoClaimer.jsx) | PENDING | WelcomePromoClaimer returns null; no rendered control. Promotion claim/auth side effects unchanged. |
| [components/promo/WelcomePromoModal.jsx](../../components/promo/WelcomePromoModal.jsx) | D | Custom promo email/actions/dialog; DS-34 now uses one visibility condition for rendering, keyboard/focus/scroll effects and image loading, with no redisplay after sign-in/sign-out. Scoped Chromium lifecycle regression covers 375/1440px in both themes; see evidence/PROMO_LIFECYCLE.md. Inert-background/screen-reader acceptance and contrast DS-26 remain open. |
| [components/share/ArtworkShare.jsx](../../components/share/ArtworkShare.jsx) | B; changed | Carbon share Modal/Button/notification and named icon action; copied label aria-live. Verify nested share/download states without sharing externally. |
| [components/share/PrintShare.jsx](../../components/share/PrintShare.jsx) | ADDED | Carbon print share Button and read-only TextInput fallback with status message/useId. Verify clipboard-unavailable manual selection; no outbound sharing executed. |
| [components/ui/EnumSelect.tsx](../../components/ui/EnumSelect.tsx) | PENDING | EnumSelect native Select has fixed violet classes and label without htmlFor/id linkage. Used in artwork editing; Carbon Select migration DS-17/18 with same values/handler. |

## Removed baseline paths

| Baseline file | Evidence at PR head | Current disposition |
|---|---|---|
| components/admin/PrintVariantsManager.tsx | Native routine print inputs/selects/actions and fixed violet form/table; original DS-03 was accurate for that snapshot. | Deleted; new app/admin/prints/PrintManager.jsx uses Carbon controls. Retire DS-03, do not reintroduce or migrate deleted code. |
| components/chat/TidioArtworkContext.jsx | useEffect context bridge returns null; no rendered controls. | Deleted; no current component remediation. Original PENDING closed as retired. |
| components/chat/TidioChat.jsx | Consent/language-gated Next Script integration; third-party widget UI not auditable from this wrapper. | Deleted; no current widget compliance claim. Original PENDING closed as retired. |

## Additional JS wrappers and sources outside the v1 roots

| File | Individual source review |
|---|---|
| [app/artwork/[sku]/page.js](../../app/artwork/[sku]/page.js) | Server metadata/route wrapper composes ArtworkDetailPage; independent controls absent. Current country/print query passed through unchanged. |
| [app/auctions/[slug]/page.js](../../app/auctions/[slug]/page.js) | Server metadata wrapper delegates to AuctionEventClient; no independent controls. Auction client review applies. |
| [app/auth/layout.js](../../app/auth/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/cart/layout.js](../../app/cart/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/catalog/page.js](../../app/catalog/page.js) | Server data/metadata wrapper composes CatalogHero/CatalogClient and main landmark. Presentation reviewed with shared catalog; DS-15 nested main. |
| [app/checkout/layout.js](../../app/checkout/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/claim/layout.js](../../app/claim/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/como-funciona/layout.js](../../app/como-funciona/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/consent/layout.js](../../app/consent/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/login/layout.js](../../app/login/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/orders/layout.js](../../app/orders/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/reset-password/layout.js](../../app/reset-password/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/signup/layout.js](../../app/signup/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [app/verify/layout.js](../../app/verify/layout.js) | Metadata/pass-through layout returns children; no independent interactive UI or Carbon substitution needed. |
| [context/CartContext.jsx](../../context/CartContext.jsx) | Carbon ToastNotification at 399 in fixed bottom/right container; check overlap with cookie/bottom nav, long errors and dismissal. Cart/order/pricing state was not modified. |
| [lib/social/render.server.jsx](../../lib/social/render.server.jsx) | Server ImageResponse bitmap renderer, IBM Plex font buffer and explicit socialTheme palette. Fixed dimensions/inline styles justified for exported art, not browser controls. Carbon React is not required inside an OG bitmap. |

## Individual stylesheet register

Source findings only. Responsive rules establish intent, not proof of absence of overflow. Literal scrims, QR backing, generated artwork and provider branding are not automatically theme violations.

| Stylesheet | Source evidence and remaining check |
|---|---|
| [app/(account)/CollectorLayout.module.css](../../app/(account)/CollectorLayout.module.css) | Collector shell and Carbon header/side-nav/tab internal overrides, many !important; phone hides menu/sidebar below 47.99rem. Verify focus and g10/g100 computed styles before pruning. DS-11. |
| [app/(account)/collection/Collection.module.css](../../app/(account)/collection/Collection.module.css) | Tokenized collection cards, 18rem grid minimum with single-column 671px override; hover image transform lacks local reduced-motion rule. Validate motion and order-footer wrapping. |
| [app/(account)/profile/Profile.module.css](../../app/(account)/profile/Profile.module.css) | Tokenized profile/XP/tiles and progress-bar internals; mobile single-column at 671px. Validate internal overrides and 16rem level minimum between breakpoints. |
| [app/PanelLayout.module.css](../../app/PanelLayout.module.css) | Tokenized panel shell with 16rem sidebar at 66rem; overflow-x:hidden can conceal clipped content. Custom backdrop and mobile admin menu rules need keyboard review. DS-11/22. |
| [app/about/About.module.css](../../app/about/About.module.css) | Editorial portrait/biography with token colors/Plex Mono and responsive profile grid; justified expressive typography. Verify sticky portrait and long contact values. |
| [app/admin/artworks/ArtworksList.module.css](../../app/admin/artworks/ArtworksList.module.css) | Tokenized Carbon table toolbar override and dense 9px/10px metadata; 671px header stacking. Verify mobile table overflow and readable metadata without imposing score. |
| [app/admin/artworks/[id]/edit/EditArtwork.module.css](../../app/admin/artworks/[id]/edit/EditArtwork.module.css) | Tokenized artwork form grids collapse at 1055px/671px; overrides Carbon button width. Keep gallery composition; verify drag/reorder controls and long helper text. |
| [app/admin/artworks/components/ImageUploader.module.css](../../app/admin/artworks/components/ImageUploader.module.css) | Tokenized upload previews and Carbon internal dropzone width/height overrides; responsive single-column at 671px. Verify focus/disabled/error and filename wrapping. |
| [app/admin/artworks/new/NewArtwork.module.css](../../app/admin/artworks/new/NewArtwork.module.css) | Tokenized new-artwork form with 672px two-column layout; contained preview and full-width Carbon submit. Verify upload and CreateSeriesModal separately. |
| [app/admin/certificates/Certificates.module.css](../../app/admin/certificates/Certificates.module.css) | Tokenized certificate table, overflow:hidden on table container, 671px header changes; tiny metadata/helper text. Verify phone table scrolling rather than assume it works. |
| [app/admin/claims/Claims.module.css](../../app/admin/claims/Claims.module.css) | Tokenized claim panels with !important; formGrid minmax(280px,1fr) stays fixed on phone while panel padding consumes width. DS-22 risk; verify selected rows and keyboard focus. |
| [app/admin/collectors/[profileId]/preview/Preview.module.css](../../app/admin/collectors/[profileId]/preview/Preview.module.css) | Tokenized sticky preview bar with warning border and wrapping; no fixed warning foreground. Verify header stacking and read-only preview content. |
| [app/admin/orders/Orders.module.css](../../app/admin/orders/Orders.module.css) | Tokenized order Tile overrides, max-content tabs, 300px item grid and 200px edit grids. DS-22 phone-overflow risk; confirm scroll region before changing order layout. |
| [app/admin/prints/PrintManager.module.css](../../app/admin/prints/PrintManager.module.css) | PrintManager uses token-free structural layout, min-width:0, wrap actions and min(100%,14rem) fields; rows collapse at 55rem. Good responsive source intent; rendered authenticated review pending. |
| [app/admin/users/Users.module.css](../../app/admin/users/Users.module.css) | Tokenized user table with 16rem search/9.5rem role minima and 671px form collapse; verify table overflow/labels and modal fields on phone. |
| [app/artwork/[sku]/ArtworkDetail.module.css](../../app/artwork/[sku]/ArtworkDetail.module.css) | Tokenized artwork detail, 1055px/671px layout changes and later editorial overrides at 623+. Older gallery selectors coexist with MediaGallery module; establish usage before deleting. DS-09. |
| [app/auctions/[slug]/AuctionEvent.module.css](../../app/auctions/[slug]/AuctionEvent.module.css) | Editorial auction cards/timer with token colors, 640/900/1200px grids and reduced-motion image rule. Custom view buttons require DS-19 semantics review. |
| [app/catalog/Catalog.module.css](../../app/catalog/Catalog.module.css) | Shared catalog/prints tokens, Plex Mono metadata, 672/1056px sizing and 767px mobile filters; Carbon internals/brand button overrides. Image fallback DS-27; reduced-motion is explicit. |
| [app/checkout/success/Success.module.css](../../app/checkout/success/Success.module.css) | Tokenized checkout success, Plex Sans/Mono and mobile-first receipt list with 672px row actions; valid editorial confirmation, verify long reference text. |
| [app/claim/Claim.module.css](../../app/claim/Claim.module.css) | Compact claim CSS uses semantic colors and 768/420px collapse; code-font-family fallback may select generic monospace. Verify actual font and checkbox alignment. |
| [app/como-funciona/ComoFunciona.module.css](../../app/como-funciona/ComoFunciona.module.css) | Editorial how-it-works devices/mocked fields; fixed uiPrimary text-on-color with dark lavender needs contrast review. Stale :global(.dark) selector vs jbu-dark DS-21; mockups are not live controls. |
| [app/globals.css](../../app/globals.css) | Central brand palette, manual --cds overrides, Tailwind/font bridge and four legacy bx selectors. DS-01; root tokens do not prove values inside Carbon Theme. Measured banner offset retained from main. |
| [app/info/InfoPage.module.css](../../app/info/InfoPage.module.css) | Tokenized information typography/nav plus custom input/submit styles; tracking form should use Carbon primitives DS-18. Editorial links themselves valid. |
| [app/landing/Landing.module.css](../../app/landing/Landing.module.css) | Landing custom palette/overlays and several later specificity overrides; .page .hero follows theme and mobile menu later becomes theme-aware. Do not report earlier raw dark rule as final rendering. DS-02. |
| [app/landing/LandingJBU.module.css](../../app/landing/LandingJBU.module.css) | JBU landing alias palette and dark duplicates; expressive title/manifesto layouts intentional, !important overrides require maintenance review. DS-02. |
| [app/login/AuthForm.module.css](../../app/login/AuthForm.module.css) | Carbon form/button icon overrides, Google provider brand palette and native text actions. Dark focus selectors use .dark/data-theme instead of jbu-dark; provider exception needs DS-21 verification. |
| [app/orders/[id]/OrderDetail.module.css](../../app/orders/[id]/OrderDetail.module.css) | Tokenized order detail with explicitly scrollable 38rem progress indicator, 1055/671px responsive cards. Verify zoom, horizontal containment and generic code-font fallback. |
| [app/verify/[sku]/Verify.module.css](../../app/verify/[sku]/Verify.module.css) | Tokenized certificate editorial layout/Plex Sans/Serif/Mono, 1055/671px stacking and print white/QR white exceptions. Integrity action styles should follow DS-18; printed document is separate from UI theme. |
| [components/AnnouncementBanner.module.css](../../components/AnnouncementBanner.module.css) | Announcement theme tokens, overflow wrapping and 671px size adaptation; validate ResizeObserver offset with long sanitized content. Background neutral follows theme; artwork/banner content exception valid. |
| [components/ArtworkLightbox.module.css](../../components/ArtworkLightbox.module.css) | Fixed near-black lightbox and white Carbon buttons/thumb borders, 671px sizing. Dark media-stage exception candidate; needs local Theme for portalled tooltips and focus DS-16, not wholesale recoloring. |
| [components/ArtworkQR.module.css](../../components/ArtworkQR.module.css) | Tokenized QR panel and full-width Carbon action; fixed white QR backing justified. Generic code-01 font-family may fall back to installed family name; verify font file load. |
| [components/CartDrawer.module.css](../../components/CartDrawer.module.css) | Tokenized cart overlay/panel, fixed backdrop and slide/fade keyframes with no reduced-motion rule; width adapts at 480px. DS-16/22; verify modal stacking with PaymentDelivery. |
| [components/MakeOfferModal.module.css](../../components/MakeOfferModal.module.css) | Tokenized offer summary/form with two-column fields collapsed at 671px. Validate error/long amount states; no unrelated color redesign needed. |
| [components/OffersList.module.css](../../components/OffersList.module.css) | Tokenized offer cards and metadata grid, 671px thumbnail/header adaptations. Verify large mail addresses and action wrapping. |
| [components/PointBoostWidget.module.css](../../components/PointBoostWidget.module.css) | Tokenized native boost package cards, 3-column to 1 at 671px; migrate routine actions DS-18 while retaining package content. Check focus ring and disabled state. |
| [components/TierProgressBar.module.css](../../components/TierProgressBar.module.css) | Tokenized tier display uses support-success for 18px multiplier and support-warning for hint; rendered contrast finding DS-28. Keep state meaning and replace foreground role only after measuring. |
| [components/TopBoosters.module.css](../../components/TopBoosters.module.css) | Tokenized leaderboard avatar/list with tiny rank metadata and warning border; verify readability/contrast and long names. No generic input replacement. |
| [components/admin/CertificateOwnershipPanel.module.css](../../components/admin/CertificateOwnershipPanel.module.css) | Tokenized certificate result buttons styled selected only by border/background; row structure is custom. DS-24 add programmatic selection or Carbon choice pattern. |
| [components/admin/PromotionalSocialEditor.module.css](../../components/admin/PromotionalSocialEditor.module.css) | PR token correction retained: previewImage layer-01, warning primary text plus semantic warning border. 680px two-column collapse; visual acceptance pending. |
| [components/admin/SocialSharingSettings.module.css](../../components/admin/SocialSharingSettings.module.css) | Structural social settings fields/legend use semantic border/text and min-width:0. No fixed surface palette; verify child editors rather than infer compliance. |
| [components/auction/Auction.module.css](../../components/auction/Auction.module.css) | Tokenized auction/bid UI with specialty live dot and history animation, reduced-motion rule, 640/900px grids. Keep countdown/live presentation, measure foreground states. |
| [components/auction/AuctionEventContext.module.css](../../components/auction/AuctionEventContext.module.css) | Tokenized auction-context three-column link grid, 2.75rem touch height/focus rule; verify long localized links on narrow phone. |
| [components/auth/AuthShell.module.css](../../components/auth/AuthShell.module.css) | Tokenized AuthShell/Plex typography, 800px single-column; brand overrides Carbon input/button/checkbox internals. Verify link distinction DS-29 and nested invalid/focus states. |
| [components/comments/Discussion.module.css](../../components/comments/Discussion.module.css) | Tokenized comments surface/type with flexible actions and contained avatars; verify long user content, reply indentation and status announcements. |
| [components/consent/Consent.module.css](../../components/consent/Consent.module.css) | Tokenized fixed consent banner, 1055px lift for bottom nav and max-height scroll; nav actually hides at 47.99rem. DS-22 breakpoint mismatch is hypothesis until measured. |
| [components/delivery/Delivery.module.css](../../components/delivery/Delivery.module.css) | Tokenized delivery summary/notes, 2-column fields to 1 at 640px and wrap actions. Verify Carbon modal date/radio/invalid states; no delivery rule changes. |
| [components/home/HeroCarousel.module.css](../../components/home/HeroCarousel.module.css) | Editorial hero fixed light/dark gradients, responsive copy/media at 672px, focus and reduced-motion rules. Keep photography composition; ensure image-dependent text contrast and persistent pause DS-19. |
| [components/home/SeriesSections.module.css](../../components/home/SeriesSections.module.css) | Editorial series layouts use theme aliases, focus outline and reduced-motion; 640/900px grids with scoped !important solo override. Validate teaser videos and countdown wrapping. |
| [components/jbu/JBUEditorial.module.css](../../components/jbu/JBUEditorial.module.css) | Shared editorial typography, theme roles and 672/1056px 2x layout. Expressive headings/brand accents justified; verify zoom and unique section labels. |
| [components/jbu/LogoJBU.module.css](../../components/jbu/LogoJBU.module.css) | Logo variants use JBU/CDS/currentColor tokens including intentional inverse logo token. SVG branding exception; validate visible variants on each surface. |
| [components/media/ArtworkVideoReveal.module.css](../../components/media/ArtworkVideoReveal.module.css) | Cinematic fixed dark overlay/video/skip with safe-area and reduced-motion. Dark stage justified candidate; dialog focus DS-16 remains independent. |
| [components/media/MediaGallery.module.css](../../components/media/MediaGallery.module.css) | Gallery theme tokens, 5rem thumbs, stage focus and 900px single-column scroll-snap with reduced-motion. Black video substrate justified; tab semantics DS-19. |
| [components/nav/MobileBottomNav.module.css](../../components/nav/MobileBottomNav.module.css) | Custom bottom nav below 47.99rem, safe-area padding/min-width:0 and focus rules; labels .6875rem and badges .625rem. Verify six-item 375px labels and active state. |
| [components/notifications/Notifications.module.css](../../components/notifications/Notifications.module.css) | Tokenized notifications, wrapping links/date and error-color badge; verify unread count meaning/contrast and long locale dates. |
| [components/promo/PromotionStudio.module.css](../../components/promo/PromotionStudio.module.css) | Tokenized promo UI/preview, responsive layout at 1056px; native hidden upload proxy requires DS-25. Canvas output dimensions and artwork colors are editorial, not token violations. |
| [components/promo/SeriesReleaseStudio.module.css](../../components/promo/SeriesReleaseStudio.module.css) | Tokenized release studio layout with 280px minimum until 671px collapse; verify actual Carbon modal inner width at 672px, canvas preview alt. No automatic overflow verdict. |
| [components/promo/WelcomePromo.module.css](../../components/promo/WelcomePromo.module.css) | Theme-aware promo surfaces and reduced-motion, mobile split at 768px; .cta white text on jbu-purple fails dark contrast by explicit pair (2.35:1). DS-26. Close-button dark scrim is media overlay exception. |
| [components/share/ArtworkShare.module.css](../../components/share/ArtworkShare.module.css) | Carbon share rows with semantic text/background and focus outline; preview images remain media. Verify Modal focus return and download fallback. |

## Complete route/layout census

All 78 entries below are enumerated. This is not a route-by-route rendered acceptance claim.

- `app/(account)/auctions/page.jsx`
- `app/(account)/collection/page.jsx`
- `app/(account)/layout.jsx`
- `app/(account)/notifications/page.jsx`
- `app/(account)/offers/page.jsx`
- `app/(account)/profile/page.jsx`
- `app/about/page.jsx`
- `app/admin/artist/page.jsx`
- `app/admin/artworks/[id]/edit/page.tsx`
- `app/admin/artworks/new/page.jsx`
- `app/admin/artworks/page.jsx`
- `app/admin/auction-events/[id]/page.jsx`
- `app/admin/auction-events/[id]/promote/page.jsx`
- `app/admin/auction-events/page.jsx`
- `app/admin/auctions/[id]/page.jsx`
- `app/admin/auctions/[id]/promote/page.jsx`
- `app/admin/auctions/page.jsx`
- `app/admin/certificates/page.jsx`
- `app/admin/claims/page.jsx`
- `app/admin/collectors/[profileId]/preview/page.jsx`
- `app/admin/comments/page.jsx`
- `app/admin/facebook/page.jsx`
- `app/admin/hero/page.jsx`
- `app/admin/home/page.jsx`
- `app/admin/layout.jsx`
- `app/admin/media/page.jsx`
- `app/admin/merchant/page.jsx`
- `app/admin/offers/page.jsx`
- `app/admin/orders/page.jsx`
- `app/admin/orders/production/page.jsx`
- `app/admin/page.jsx`
- `app/admin/prints/page.jsx`
- `app/admin/series/[id]/page.jsx`
- `app/admin/series/page.jsx`
- `app/admin/users/page.jsx`
- `app/artwork/[sku]/page.js`
- `app/auctions/[slug]/page.js`
- `app/auth/callback/page.jsx`
- `app/auth/layout.js`
- `app/cart/layout.js`
- `app/cart/page.jsx`
- `app/catalog/page.js`
- `app/checkout/cancel/page.jsx`
- `app/checkout/layout.js`
- `app/checkout/success/page.jsx`
- `app/claim/layout.js`
- `app/claim/lote/page.jsx`
- `app/claim/page.jsx`
- `app/como-funciona/layout.js`
- `app/como-funciona/page.jsx`
- `app/consent/layout.js`
- `app/consent/page.jsx`
- `app/cookies/page.jsx`
- `app/guest-orders/[token]/page.jsx`
- `app/info/layout.jsx`
- `app/info/politica-de-privacidad/page.jsx`
- `app/info/soporte/page.jsx`
- `app/info/terminos-de-servicio/page.jsx`
- `app/info/tracking/page.jsx`
- `app/landing/page.tsx`
- `app/layout.tsx`
- `app/login/layout.js`
- `app/login/page.jsx`
- `app/orders/[id]/page.jsx`
- `app/orders/layout.js`
- `app/page.tsx`
- `app/prints/[variantId]/not-found.jsx`
- `app/prints/[variantId]/page.jsx`
- `app/prints/page.jsx`
- `app/privacy/page.jsx`
- `app/reset-password/layout.js`
- `app/reset-password/page.jsx`
- `app/series/[slug]/page.jsx`
- `app/signup/layout.js`
- `app/signup/page.jsx`
- `app/terms/page.jsx`
- `app/verify/[sku]/page.tsx`
- `app/verify/layout.js`
