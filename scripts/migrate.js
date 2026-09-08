const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Falta configurar NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { timeout: 0 }
});

function parsePrice(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

function mapStatus(rawStatus) {
  if (!rawStatus) return 'AVAILABLE';
  const statusStr = String(rawStatus).trim().toUpperCase();
  
  if (statusStr === 'SOLD' || statusStr === 'VENDIDA' || statusStr === 'VENDIDO') {
    return 'OWNED';
  }
  if (statusStr === 'RESERVED' || statusStr === 'RESERVADA' || statusStr === 'RESERVADO') {
    return 'RESERVED';
  }
  return 'AVAILABLE';
}

async function migrateArtworks() {
  console.log('🚀 Iniciando migración de obras a Supabase...');

  const jsonPath = path.join(__dirname, '../artworks_seed.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ No se encontró el archivo artworks_seed.json en la raíz.');
    return;
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const artworks = JSON.parse(rawData);

  console.log(`📄 Se encontraron ${artworks.length} obras para procesar.`);

  for (const item of artworks) {
    const sku = item['Code'];
    if (!sku) continue;

    const basePrice = parsePrice(item['Original Price']);
    const calculatedPrice = parsePrice(item['Price']) || basePrice;
    const isAvailableBool = String(item['IsAvailable']).toUpperCase() === 'TRUE';
    const isFeaturedBool = String(item['featured']).toUpperCase() === 'TRUE';

    const statusFormatted = item['Status'] 
      ? mapStatus(item['Status']) 
      : (isAvailableBool ? 'AVAILABLE' : 'OWNED');

    const artworkPayload = {
      sku: sku,
      title: item['Title'],
      series: item['Series Title'] || 'Estudio JBU',
      year: parseInt(item['Year']) || 2026,
      medium: item['Medium'] || item['Técnica'] || null,
      dimensions: item['Dimensions'] || item['Dimensiones'] || null,
      primary_image_url: item['Image URL'] || item['Image'] || null,
      status: statusFormatted,
      base_price_mxn: basePrice,
      calculated_price_mxn: calculatedPrice,
      description: item['Description'] || null,
      featured: isFeaturedBool,
      resale_checkout_url: item['Stripe URL'] || item['Checkout URL'] || null
    };

    const { data, error } = await supabase
      .from('artworks')
      .upsert(artworkPayload, { onConflict: 'sku' });

    if (error) {
      console.error(`⚠️ Error al procesar la obra ${sku} (${item['Title']}): ${error.message}`);
    } else {
      console.log(`✅ Obra procesada correctamente: ${item['Title']} (${sku}) [Status: ${statusFormatted}]`);
    }
  }

  console.log('🎉 Migración y sincronización completada exitosamente.');
}

migrateArtworks()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error crítico en la migración:', err);
    process.exit(1);
  });