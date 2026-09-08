import { createClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')

    if (!sku) {
      return new Response('Falta el parámetro SKU', { status: 400 })
    }

    // Inicializar cliente de Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Consultar la obra y los datos de su propietario actual
    const { data: artwork, error } = await supabase
      .from('artworks')
      .select(`
        *,
        profiles:current_owner_id (
          full_name,
          email
        )
      `)
      .eq('sku', sku)
      .single()

    if (error || !artwork) {
      return new Response('Obra no encontrada', { status: 404 })
    }

    if (artwork.ownership_status !== 'VERIFIED') {
      return new Response('El certificado para esta obra no ha sido verificado ni emitido', { status: 403 })
    }

    // Crear documento PDF en tamaño Carta con orientación horizontal (Landscape)
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: 40
    })

    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))

    // Borde Decorativo Elegante
    doc
      .rect(20, 20, 752, 572)
      .lineWidth(1)
      .strokeColor('#262626')
      .stroke()

    doc
      .rect(24, 24, 744, 564)
      .lineWidth(0.5)
      .strokeColor('#d4af37') // Tono Dorado
      .stroke()

    // Encabezado
    doc
      .fillColor('#d4af37')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('ESTUDIO JOSUÉ BELTRÁN URESTI', 60, 60, { characterSpacing: 2 })

    doc
      .fillColor('#737373')
      .fontSize(8)
      .font('Helvetica')
      .text('CERTIFICADO OFICIAL DE AUTENTICIDAD Y PROVENIENCIA', 60, 75, { characterSpacing: 1 })

    // Título Principal
    doc
      .fillColor('#171717')
      .fontSize(26)
      .font('Times-Roman')
      .text('Certificado de Autenticidad', 60, 115)

    doc
      .fillColor('#525252')
      .fontSize(10)
      .font('Helvetica')
      .text(
        'Por la presente se certifica que la obra aquí descrita es una pieza original, auténtica y única firmada por el artista.',
        60,
        150,
        { width: 670, lineGap: 4 }
      )

    // Línea Divisora
    doc
      .moveTo(60, 180)
      .lineTo(732, 180)
      .lineWidth(0.5)
      .strokeColor('#e5e5e5')
      .stroke()

    // Ficha Técnica de la Obra
    const startY = 205

    // Columna Izquierda: Datos de la Obra
    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('TÍTULO DE LA OBRA', 60, startY)
    doc.fillColor('#171717').fontSize(16).font('Times-Bold').text(artwork.title, 60, startY + 12)

    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('TÉCNICA Y MEDIO', 60, startY + 45)
    doc.fillColor('#262626').fontSize(10).font('Helvetica').text(artwork.technique || 'Técnica Mixta', 60, startY + 57)

    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('DIMENSIONES', 60, startY + 80)
    doc.fillColor('#262626').fontSize(10).font('Helvetica').text(artwork.dimensions || 'N/A', 60, startY + 92)

    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('CÓDIGO SKU', 60, startY + 115)
    doc.fillColor('#d4af37').fontSize(10).font('Helvetica-Bold').text(artwork.sku, 60, startY + 127)

    // Columna Derecha: Datos del Coleccionista y Registro
    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('PROPIETARIO REGISTRADO', 420, startY)
    doc.fillColor('#171717').fontSize(11).font('Helvetica-Bold').text(artwork.profiles?.full_name || 'Coleccionista Privado', 420, startY + 12)

    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('FECHA DE EMISIÓN', 420, startY + 45)
    const issueDate = artwork.certificate_issued_at 
      ? new Date(artwork.certificate_issued_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A'
    doc.fillColor('#262626').fontSize(10).font('Helvetica').text(issueDate, 420, startY + 57)

    doc.fillColor('#8c8c8c').fontSize(8).font('Helvetica-Bold').text('ESTATUS CRIPTOGRÁFICO', 420, startY + 80)
    doc.fillColor('#16a34a').fontSize(10).font('Helvetica-Bold').text('VERIFICADO & REGISTRADO', 420, startY + 92)

    // Bloque Criptográfico / Hash SHA-256
    const hashY = 380
    doc
      .rect(60, hashY, 672, 45)
      .fillAndStroke('#fcfbf7', '#e5e0d8')

    doc
      .fillColor('#8c8c8c')
      .fontSize(7)
      .font('Helvetica-Bold')
      .text('HASH ÚNICO DE AUTENTICIDAD (SHA-256)', 72, hashY + 8)

    doc
      .fillColor('#262626')
      .fontSize(8)
      .font('Courier')
      .text(artwork.certificate_hash || 'PENDIENTE_DE_FIRMA', 72, hashY + 22, { width: 648 })

    // Sección de Firma y Pie de Página
    const footerY = 460

    doc
      .moveTo(60, footerY + 30)
      .lineTo(260, footerY + 30)
      .lineWidth(0.5)
      .strokeColor('#a3a3a3')
      .stroke()

    doc
      .fillColor('#171717')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('Josué Beltrán Uresti', 60, footerY + 36)

    doc
      .fillColor('#737373')
      .fontSize(8)
      .font('Helvetica')
      .text('Firma del Artista / Autor', 60, footerY + 48)

    doc
      .fillColor('#a3a3a3')
      .fontSize(7)
      .font('Helvetica')
      .text(`Consulta el registro público de esta pieza en: https://josueuresti.com/verify/${artwork.sku}`, 60, 550)

    doc.end()

    // Esperar a que PDFKit termine de renderizar el buffer
    const pdfBuffer = await new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Certificado_${artwork.sku}.pdf"`
      }
    })
  } catch (err) {
    return new Response(`Error generando certificado: ${err.message}`, { status: 500 })
  }
}