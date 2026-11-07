# JBU — Codebase UI Inventory and Source Review Register

Snapshot: **main**, 2026-11-07. Generated from GitHub recursive tree (not browser rendering).

- Discovered **72 route/layout entry points**, **141 JSX/TSX UI source files**, **56 CSS/SCSS files**.
- **24 UI source files directly inspected**; **117 files are unclassified**. Categories below are *provisional source-only triage*, NOT verified Carbon visual compliance.
- Reviewed subset distribution: B=8/24 (33.3%); C=8/24 (33.3%); D=3/24 (12.5%); E=5/24 (20.8%). A=0. **These percentages must never be labeled application-wide compliance**.
- Total UI inspection coverage: 17.0%. Unknown is not compliant.

## Routes / layouts (all enumerated, not all manually reviewed)

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
- `app/admin/hero/page.jsx`
- `app/admin/home/page.jsx`
- `app/admin/layout.jsx`
- `app/admin/media/page.jsx`
- `app/admin/merchant/page.jsx`
- `app/admin/offers/page.jsx`
- `app/admin/orders/page.jsx`
- `app/admin/page.jsx`
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

## UI components and screens

Legend: B/C/D/E are provisional source triage, PENDING means not individually audited. A (fully conformant) requires runtime evidence and is not assigned based on imports alone.

| Source | Triage | Basis / required follow-up |
|---|---|---|
| `app/(account)/auctions/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/(account)/collection/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/(account)/layout.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/(account)/notifications/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/(account)/offers/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/(account)/profile/page.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `app/ClientLayout.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/about/ArtistAbout.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/about/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/artist/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/artworks/[id]/edit/page.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/artworks/components/ImageUploader.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/artworks/components/VideoUploader.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/artworks/new/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/artworks/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/auction-events/[id]/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/auction-events/[id]/promote/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/auction-events/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/auctions/[id]/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/auctions/[id]/promote/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/auctions/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/certificates/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/claims/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/collectors/[profileId]/preview/PreviewClient.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/collectors/[profileId]/preview/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/hero/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/home/page.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `app/admin/layout.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `app/admin/media/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/merchant/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/offers/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/orders/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/series/[id]/page.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `app/admin/series/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/admin/users/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/artwork/[sku]/ArtworkDetailClient.tsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `app/artwork/[sku]/ArtworkEngagement.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/auctions/[slug]/AuctionEventClient.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/auth/callback/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/cart/page.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `app/catalog/CatalogClient.tsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `app/catalog/CatalogHero.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/checkout/cancel/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/checkout/success/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/claim/lote/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/claim/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/como-funciona/PlatformScreens.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/como-funciona/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/consent/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/cookies/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/guest-orders/[token]/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/info/InfoPage.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/info/layout.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/info/politica-de-privacidad/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/info/soporte/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/info/terminos-de-servicio/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/info/tracking/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/landing/LandingClient.jsx` | D | Custom UI controls or navigation where Carbon counterpart requires evaluation |
| `app/landing/page.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/layout.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/login/GoogleButton.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/login/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/orders/[id]/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/page.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/prints/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/privacy/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/reset-password/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/series/[slug]/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/signup/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/terms/page.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `app/verify/[sku]/page.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/AnnouncementBanner.jsx` | E | Specialized art/media/announcement/mobility affordance; accessibility exception still to validate |
| `components/AppThemeProvider.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/ArtworkImage.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/ArtworkLightbox.jsx` | E | Specialized art/media/announcement/mobility affordance; accessibility exception still to validate |
| `components/ArtworkQR.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/AskForPriceButton.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/BuyButton.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/CartDrawer.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `components/CertificateActions.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/CreateSeriesModal.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/CurrencyProvider.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/CurrencyToggle.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/I18nProvider.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/LanguageToggle.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/MakeOfferModal.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/Navbar.tsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/OffersList.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/PhysicalEditionBuyButton.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/PointBoostWidget.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/TierProgressBar.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/TopBoosters.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/UserNavbarDropdown.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/VerifyCertificate.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/admin/CertificateOwnershipPanel.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/admin/HeroStudio.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/admin/PhysicalEditionManager.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/admin/PrintVariantsManager.tsx` | D | Custom UI controls or navigation where Carbon counterpart requires evaluation |
| `components/admin/PromotionalSocialEditor.jsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/admin/ProvenanceManager.jsx` | C | Carbon combined with native controls / concentrated inline layout styles |
| `components/admin/SeriesHomeList.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/admin/SocialSharingSettings.jsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/auction/AuctionEventContext.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/auction/AuctionPanel.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/auction/Countdown.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/auction/HomeAuctions.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/auction/PendingPayment.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/auth/AuthShell.jsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/auth/OAuthReturnHandler.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/catalog/PromotionalLandingTitle.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/certificates/PhysicalEditionClaimButton.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/chat/TidioArtworkContext.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/chat/TidioChat.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/collection/CollectionRegistry.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/collection/CollectionView.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/consent/CookieConsent.jsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/consent/LegalCheckbox.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/consent/LegalDocument.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/delivery/AdminDeliveryOrder.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/delivery/AdminDeliverySettings.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/delivery/OrderDeliverySummary.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/delivery/PaymentDelivery.jsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/home/HeroCarousel.jsx` | E | Specialized art/media/announcement/mobility affordance; accessibility exception still to validate |
| `components/home/SeriesSections.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/jbu/JBUEditorial.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/jbu/LogoJBU.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/media/ArtworkVideoReveal.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/media/MediaGallery.jsx` | E | Specialized art/media/announcement/mobility affordance; accessibility exception still to validate |
| `components/media/OptimizedImg.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/nav/MobileBottomNav.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/nav/PublicBottomNav.jsx` | E | Specialized art/media/announcement/mobility affordance; accessibility exception still to validate |
| `components/notifications/NotificationBell.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/notifications/NotificationCenter.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/promo/PromotionStudio.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/promo/SeriesReleaseStudio.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/promo/WelcomePromoBadge.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/promo/WelcomePromoClaimer.jsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |
| `components/promo/WelcomePromoModal.jsx` | D | Custom UI controls or navigation where Carbon counterpart requires evaluation |
| `components/share/ArtworkShare.jsx` | B | Carbon patterns or justified compositional wrapper; local adaptation needs visual verification |
| `components/ui/EnumSelect.tsx` | PENDING | Await source, rendered desktop/mobile, light/dark and keyboard review |

## Stylesheets (enumeration not proof of style compliance)

- `app/(account)/CollectorLayout.module.css`
- `app/(account)/collection/Collection.module.css`
- `app/(account)/profile/Profile.module.css`
- `app/PanelLayout.module.css`
- `app/about/About.module.css`
- `app/admin/artworks/ArtworksList.module.css`
- `app/admin/artworks/[id]/edit/EditArtwork.module.css`
- `app/admin/artworks/components/ImageUploader.module.css`
- `app/admin/artworks/new/NewArtwork.module.css`
- `app/admin/certificates/Certificates.module.css`
- `app/admin/claims/Claims.module.css`
- `app/admin/collectors/[profileId]/preview/Preview.module.css`
- `app/admin/orders/Orders.module.css`
- `app/admin/users/Users.module.css`
- `app/artwork/[sku]/ArtworkDetail.module.css`
- `app/auctions/[slug]/AuctionEvent.module.css`
- `app/catalog/Catalog.module.css`
- `app/checkout/success/Success.module.css`
- `app/claim/Claim.module.css`
- `app/como-funciona/ComoFunciona.module.css`
- `app/globals.css`
- `app/info/InfoPage.module.css`
- `app/landing/Landing.module.css`
- `app/landing/LandingJBU.module.css`
- `app/login/AuthForm.module.css`
- `app/orders/[id]/OrderDetail.module.css`
- `app/verify/[sku]/Verify.module.css`
- `components/AnnouncementBanner.module.css`
- `components/ArtworkLightbox.module.css`
- `components/ArtworkQR.module.css`
- `components/CartDrawer.module.css`
- `components/MakeOfferModal.module.css`
- `components/OffersList.module.css`
- `components/PointBoostWidget.module.css`
- `components/TierProgressBar.module.css`
- `components/TopBoosters.module.css`
- `components/admin/CertificateOwnershipPanel.module.css`
- `components/admin/PromotionalSocialEditor.module.css`
- `components/admin/SocialSharingSettings.module.css`
- `components/auction/Auction.module.css`
- `components/auction/AuctionEventContext.module.css`
- `components/auth/AuthShell.module.css`
- `components/consent/Consent.module.css`
- `components/delivery/Delivery.module.css`
- `components/home/HeroCarousel.module.css`
- `components/home/SeriesSections.module.css`
- `components/jbu/JBUEditorial.module.css`
- `components/jbu/LogoJBU.module.css`
- `components/media/ArtworkVideoReveal.module.css`
- `components/media/MediaGallery.module.css`
- `components/nav/MobileBottomNav.module.css`
- `components/notifications/Notifications.module.css`
- `components/promo/PromotionStudio.module.css`
- `components/promo/SeriesReleaseStudio.module.css`
- `components/promo/WelcomePromo.module.css`
- `components/share/ArtworkShare.module.css`

## Audit methodology and limitations

The codebase tree enumerates entry points, but categorization must be validated with direct markup/CSS inspection and actual user interactions. Reusable compound components that contain branded art imagery are not automatically noncompliant. The pending files and responsive/contrast/screen-reader assessments are an explicit audit backlog. Do not extrapolate the reviewed subset distribution to the whole app.