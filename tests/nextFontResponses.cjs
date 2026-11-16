/* eslint-disable @typescript-eslint/no-require-imports -- Next loads this test fixture through CommonJS require. */
// CI-only responses for Next's Google Fonts test hook. Use real IBM Plex files
// already installed by Carbon; production keeps its existing next/font setup.
const path = require('node:path')
const families = {
  'IBM Plex Sans': ['plex-sans', 'IBMPlexSans'],
  'IBM Plex Serif': ['plex-serif', 'IBMPlexSerif'],
  'IBM Plex Mono': ['plex-mono', 'IBMPlexMono'],
}
const weights = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' }
module.exports = new Proxy({}, {
  get(_target, key) {
    if (typeof key !== 'string' || !key.startsWith('https://fonts.googleapis.com/css2?')) return undefined
    const family = new URL(key).searchParams.get('family')?.split(':')[0]
    const source = families[family]
    if (!source) return undefined
    return [false, true].flatMap(italic => Object.entries(weights).map(([weight, face]) => {
      const suffix = italic ? (face === 'Regular' ? 'Italic' : face + 'Italic') : face
      const file = path.resolve(__dirname, '../node_modules/@ibm', source[0], 'fonts/complete/woff2', source[1] + '-' + suffix + '.woff2')
      return `/* latin */\n@font-face {\n  font-family: '${family}';\n  font-style: ${italic ? 'italic' : 'normal'};\n  font-weight: ${weight};\n  src: url(${file}) format('woff2');\n}`
    })).join('\n')
  },
})
