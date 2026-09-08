const QRCode = require('qrcode')
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const WebSocket = require('ws')
const { createClient } = require('@supabase/supabase-js')

// Definir WebSocket global para Node < 22 antes de crear el cliente
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket
}

// Cargar variables de entorno desde .env.local
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Falta configurar NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

const DOMAIN = 'https://josueuresti.com'

async function generateAllQRs() {
  const outputDir = path.join(process.cwd(), 'public', 'qr-codes')

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log('🚀 Obteniendo catálogo de obras desde Supabase...')
  const { data: artworks, error } = await supabase
    .from('artworks')
    .select('sku, title')

  if (error) {
    console.error('❌ Error al consultar Supabase:', error.message)
    return
  }

  if (!artworks || artworks.length === 0) {
    console.log('⚠️ No se encontraron obras en la base de datos.')
    return
  }

  for (const art of artworks) {
    const artworkUrl = `${DOMAIN}/artwork/${art.sku}`
    const fileName = `QR_${art.sku}.png`
    const filePath = path.join(outputDir, fileName)

    await QRCode.toFile(filePath, artworkUrl, {
      width: 600,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })

    console.log(`✅ Creado: ${fileName} -> ${artworkUrl}`)
  }

  console.log(`\n🎉 Todos los códigos QR se guardaron exitosamente en: public/qr-codes/`)
}

generateAllQRs()