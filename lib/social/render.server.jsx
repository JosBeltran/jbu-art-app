/* eslint-disable @next/next/no-img-element -- ImageResponse requires native img with prepared bytes. */
import 'server-only'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import themeTokens from '../../data/socialTheme.json'
import { SOCIAL_FORMATS, socialFormat } from './config.js'
import { preparedAsset } from './assets.server.js'
import { ARTWORK_PLACEHOLDER } from '../artworkPlaceholder.js'

const plexFont = () => readFile(join(process.cwd(), 'public/social/IBMPlexSans-Regular.woff'))

async function encodeSocialImage(element, width, height, font) {
  const response = new ImageResponse(element, {
    width, height, fonts: [{ name: 'IBM Plex Sans', data: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength), style: 'normal', weight: 400 }],
  })
  return sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 95, mozjpeg: true }).toBuffer()
}

export async function renderSocialImage(artwork, context, requestedFormat) {
  const { config, presentation } = context
  const format = socialFormat(requestedFormat, config)
  const { width, height } = SOCIAL_FORMATS[format]
  const horizontal = format === 'horizontal'
  const options = config[format]
  const branding = options.branding
  const palette = themeTokens[config.theme]
  const band = branding ? (horizontal ? 324 : 210) : 0
  const horizontalPadding = 24
  const boxWidth = horizontal ? width - band - horizontalPadding * 2 : width - 96
  const boxHeight = horizontal ? height - horizontalPadding * 2 : height - band - 96
  const [art, logo, font] = await Promise.all([
    preparedAsset(artwork.primary_image_url || ARTWORK_PLACEHOLDER, boxWidth, boxHeight).then(async image => image || preparedAsset(ARTWORK_PLACEHOLDER, boxWidth, boxHeight)),
    branding && options.logo && config.logoUrl ? preparedAsset(config.logoUrl, horizontal ? 68 : 52, horizontal ? 68 : 52) : null,
    plexFont(),
  ])
  const nameFallback = options.logo && !logo
  const title = presentation.title.replace(/(\S{22})/g, '$1\u200b')
  const artist = presentation.artist.replace(/(\S{22})/g, '$1\u200b')
  const editorial = branding ? <div style={{ position: 'absolute', left: 0, top: horizontal ? 0 : height - band, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: horizontal ? '36px 30px' : '24px 48px', width: horizontal ? band : width, height: horizontal ? height : band, flexShrink: 0, ...(horizontal ? { borderRight: `1px solid ${palette.border}` } : { borderTop: `1px solid ${palette.border}` }) }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {logo && <div style={{ display: 'flex', background: palette.logoSurface, padding: 6 }}><img src={logo.src} width={logo.width} height={logo.height} alt="" /></div>}
      {(options.artist || nameFallback) && <div style={{ display: 'flex', flexWrap: 'wrap', color: palette.muted, fontSize: horizontal ? 21 : 26 }}>{artist}</div>}
    </div>
    {options.title && <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: horizontal ? (title.length > 80 ? 26 : 34) : 32, lineHeight: 1.18 }}>{title}</div>}
    {config.showDomain && options.domain && <div style={{ display: 'flex', fontSize: 16, color: palette.muted }}>{presentation.domain}</div>}
  </div> : null
  const visual = <div style={{ position: 'absolute', left: horizontal ? band : 0, top: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: horizontal ? width - band : width, height: horizontal ? height : height - band, padding: horizontal ? horizontalPadding : 48, flexShrink: 0 }}>
    {art && <img src={art.src} width={art.width} height={art.height} alt={presentation.title} style={{ objectFit: 'contain' }} />}
  </div>
  return encodeSocialImage(<div style={{ position: 'relative', display: 'flex', width, height, background: palette.background, color: palette.foreground, fontFamily: 'IBM Plex Sans' }}>{visual}{editorial}</div>, width, height, font)
}

async function firstPreparedAsset(candidates, width, height) {
  for (const candidate of candidates) {
    const asset = await preparedAsset(candidate, width, height)
    if (asset) return asset
  }
  return null
}

export async function renderPrintSocialImage({ images, presentation, theme, logoUrl }) {
  const { width, height } = SOCIAL_FORMATS.horizontal
  const palette = themeTokens[theme]
  const [art, logo, font] = await Promise.all([
    firstPreparedAsset([...images, ARTWORK_PLACEHOLDER], 716, 570),
    firstPreparedAsset([logoUrl, '/jbu-logo.png'].filter(Boolean), 54, 54),
    plexFont(),
  ])
  const wrap = text => text.replace(/(\S{20})/g, '$1\u200b')
  const specs = [presentation.edition, presentation.paper, presentation.framing].filter(Boolean).join(' · ')
  const visualWidth = 790
  // Anchor the small badge to the fitted preview's corner, including portrait prints.
  const badgeLeft = Math.min(visualWidth - (logo?.width || 54) - 30,
    Math.round((visualWidth + (art?.width || 716)) / 2) - 18)
  const badgeTop = Math.max(14, Math.round((height - (art?.height || 570)) / 2) - 12)
  return encodeSocialImage(
    <div style={{ display: 'flex', width, height, background: palette.background, color: palette.foreground, fontFamily: 'IBM Plex Sans' }}>
      <div style={{ display: 'flex', position: 'relative', width: visualWidth, height, alignItems: 'center', justifyContent: 'center' }}>
        {art && <img src={art.src} width={art.width} height={art.height} alt="" style={{ objectFit: 'contain' }} />}
        {logo && <div style={{ position: 'absolute', left: badgeLeft, top: badgeTop, display: 'flex', background: palette.logoSurface,
          border: `1px solid ${palette.border}`, borderRadius: 4, padding: 7 }}>
          <img src={logo.src} width={logo.width} height={logo.height} alt="" />
        </div>}
      </div>
      <div style={{ display: 'flex', width: 410, height, padding: '50px 32px', flexDirection: 'column',
        justifyContent: 'center', borderLeft: `1px solid ${palette.border}`, gap: 15 }}>
        <div style={{ display: 'flex', fontSize: 18, letterSpacing: 2, color: palette.muted }}>JBU ART</div>
        <div style={{ display: 'flex', fontSize: presentation.artworkTitle.length > 78 ? 27 : 38, lineHeight: 1.13 }}>
          {wrap(presentation.artworkTitle)}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: palette.muted }}>{presentation.kind}</div>
        <div style={{ display: 'flex', fontSize: 21 }}>{wrap([presentation.sizeLabel, presentation.centimeters].filter(Boolean).join(' · ')) || presentation.dimensionsLabel}</div>
        {presentation.inches && <div style={{ display: 'flex', fontSize: 16, color: palette.muted }}>{presentation.inches}</div>}
        <div style={{ display: 'flex', fontSize: 16, color: palette.muted }}>{wrap(specs.length > 110 ? specs.slice(0, 107) + '…' : specs)}</div>
      </div>
    </div>, width, height, font)
}
