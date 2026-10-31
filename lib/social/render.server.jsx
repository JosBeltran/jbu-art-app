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

export async function renderSocialImage(artwork, context, requestedFormat) {
  const { config, presentation } = context
  const format = socialFormat(requestedFormat, config)
  const { width, height } = SOCIAL_FORMATS[format]
  const horizontal = format === 'horizontal'
  const options = config[format]
  const branding = options.branding
  const palette = themeTokens[config.theme]
  const band = branding ? (horizontal ? 324 : 210) : 0
  const boxWidth = horizontal ? width - band - 72 : width - 96
  const boxHeight = horizontal ? height - 72 : height - band - 96
  const [art, logo, font] = await Promise.all([
    preparedAsset(artwork.primary_image_url || ARTWORK_PLACEHOLDER, boxWidth, boxHeight).then(async image => image || preparedAsset(ARTWORK_PLACEHOLDER, boxWidth, boxHeight)),
    branding && options.logo && config.logoUrl ? preparedAsset(config.logoUrl, horizontal ? 68 : 52, horizontal ? 68 : 52) : null,
    readFile(join(process.cwd(), 'public/social/IBMPlexSans-Regular.woff')),
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
  const visual = <div style={{ position: 'absolute', left: horizontal ? band : 0, top: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: horizontal ? width - band : width, height: horizontal ? height : height - band, padding: horizontal ? 36 : 48, flexShrink: 0 }}>
    {art && <img src={art.src} width={art.width} height={art.height} alt={presentation.title} style={{ objectFit: 'contain' }} />}
  </div>
  const response = new ImageResponse(<div style={{ position: 'relative', display: 'flex', width, height, background: palette.background, color: palette.foreground, fontFamily: 'IBM Plex Sans' }}>{visual}{editorial}</div>, {
    width, height, fonts: [{ name: 'IBM Plex Sans', data: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength), style: 'normal', weight: 400 }],
  })
  return sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
}
