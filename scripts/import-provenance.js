import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Cargar variables de entorno
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Falta configurar SUPABASE_URL o SUPABASE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function importProvenance() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'provenance_history.json')
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ No se encontró el archivo en: ${filePath}`)
      return
    }

    const rawData = fs.readFileSync(filePath, 'utf-8')
    const historyData = JSON.parse(rawData)

    console.log(`🚀 Iniciando importación para ${historyData.length} obras...\n`)

    for (const item of historyData) {
      console.log(`🔍 Buscando obra con SKU: ${item.sku}...`)

      // 1. Obtener el ID de la obra por su SKU
      const { data: artwork, error: artError } = await supabase
        .from('artworks')
        .select('id, title')
        .eq('sku', item.sku)
        .single()

      if (artError || !artwork) {
        console.warn(`⚠️ No se encontró la obra con SKU: ${item.sku}. Omitiendo...`)
        continue
      }

      console.log(`   Obra encontrada: "${artwork.title}" (ID: ${artwork.id})`)

      // 2. Insertar cada evento de proveniencia
      for (const evt of item.events) {
        const payload = {
          artwork_id: artwork.id,
          event_type: evt.event_type || 'CREATIVE_PROCESS',
          event_date: evt.event_date || '2026',
          title: evt.title,
          description: evt.description || '',
          image_url: evt.image_url || null
        }

        const { error: insertError } = await supabase
          .from('provenance_events')
          .insert([payload])

        if (insertError) {
          console.error(`   ❌ Error al insertar evento "${evt.title}":`, insertError.message)
        } else {
          console.log(`   ✅ Evento registrado: "${evt.title}"`)
        }
      }
      console.log('---')
    }

    console.log('\n🎉 Importación de proveniencia completada exitosamente.')

  } catch (error) {
    console.error('❌ Error durante la ejecución del script:', error)
  }
}

importProvenance()