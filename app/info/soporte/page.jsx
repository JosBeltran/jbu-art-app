'use client'

import { InfoShell, InfoSections } from '../InfoPage'

const WA = 'https://wa.me/528123518298'

const sections = [
  { label: ['Obras originales', 'Original artworks'], title: ['Precios en pesos mexicanos (MXN)', 'Priced in Mexican pesos (MXN)'], paragraphs: [[
    'Todas las pinturas originales están cotizadas en pesos mexicanos (MXN). Cada pieza se embala cuidadosamente con protección reforzada y se asegura para envío nacional o internacional. Tras procesar tu pago, recibirás en un plazo de 3 a 5 días hábiles tu número de guía (FedEx, DHL o UPS) para rastrear el envío en tiempo real.',
    'All original paintings are priced in Mexican pesos (MXN). Each piece is carefully hand-packed in reinforced casing and insured for domestic or international shipping. Once your payment is processed, you will receive a tracking number (FedEx, DHL or UPS) within 3 to 5 business days to follow your shipment in real time.',
  ]] },
  { label: ['Fundas para celular', 'Phone cases'], title: ['Envíos solo a Estados Unidos', 'US shipping only'], paragraphs: [[
    'Por el momento, las fundas solo se envían dentro de Estados Unidos. Al confirmar tu pago, tu orden se genera automáticamente con nuestro socio de impresión Prodigi. Te enviaremos por correo la fecha estimada de entrega y la guía en cuanto salga de producción.',
    'Phone cases currently ship within the United States only. Once your payment is confirmed, your order is automatically sent to production with our print partner Prodigi. You will receive an email with the estimated delivery date and full tracking once it leaves the facility.',
  ]] },
  { label: ['Seguimiento', 'Tracking'], title: ['Rastrea tu pedido', 'Track your order'], paragraphs: [[
    'Si ya tienes tu número de pedido, consulta su estado en la página de seguimiento. Todos los pagos se procesan de forma segura con Stripe.',
    'If you already have your order number, check its status on the tracking page. All payments are securely processed by Stripe.',
  ]], action: { href: '/info/tracking', label: ['Rastrear envío', 'Track order'] } },
  { label: ['Contacto', 'Contact'], title: ['Contacto directo', 'Direct contact'], items: [
    [['WhatsApp', 'WhatsApp'], <a key="wa" href={WA} target="_blank" rel="noreferrer">+52 81 2351 8298</a>],
    [['Correo', 'Email'], <a key="em" href="mailto:josue.beltran.u@gmail.com">josue.beltran.u@gmail.com</a>],
    [['Horario', 'Hours'], ['Lunes a sábado, 9:00 a 19:00 (GMT-6, Monterrey, N.L., México)', 'Monday to Saturday, 9:00 AM to 7:00 PM (GMT-6, Monterrey, N.L., Mexico)']],
  ], action: { href: WA, external: true, label: ['Escribir por WhatsApp', 'Message on WhatsApp'] } },
]

export default function SoportePage() {
  return (
    <InfoShell
      label={['JBU · Soporte', 'JBU · Support']}
      title={['Soporte y compras', 'Support & orders']}
      intro={['Ya sea una obra original o una funda, mi prioridad es darte transparencia y confianza en cada compra.', 'Whether it is an original artwork or a phone case, transparency and collector satisfaction are my highest priorities.']}
    >
      <InfoSections sections={sections} />
    </InfoShell>
  )
}
