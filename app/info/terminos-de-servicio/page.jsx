'use client'

import { InfoShell, InfoSections } from '../InfoPage'

const sections = [
  { title: ['Obras y precios', 'Artworks and prices'], paragraphs: [
    ['Los precios se expresan en pesos mexicanos (MXN) o dólares estadounidenses (USD) e incluyen los impuestos aplicables en México.', 'Prices are shown in Mexican pesos (MXN) or US dollars (USD) and include applicable taxes in Mexico.'],
    ['La mayoría de las piezas son originales y únicas (pinturas, dibujos y técnica mixta); su disponibilidad depende del orden de confirmación de pago.', 'Most pieces are original and unique (paintings, drawings and mixed media); availability depends on the order of payment confirmation.'],
    ['Ninguna obra se considera reservada sin la confirmación del depósito inicial o del pago total.', 'No artwork is considered reserved without confirmation of the initial deposit or full payment.'],
  ] },
  { title: ['Métodos de pago', 'Payment methods'], paragraphs: [['Los pagos con tarjeta (Visa, Mastercard, American Express) o transferencia se procesan de forma segura con Stripe. El sitio no almacena tus datos financieros.', 'Card payments (Visa, Mastercard, American Express) or transfers are processed securely by Stripe. The site never stores your financial data.']] },
  { title: ['Envíos', 'Shipping'], items: [
    [['Embalaje', 'Packing'], ['Todas las piezas se embalan con protección de alta seguridad antes del envío.', 'Every piece is packed with high-security protection before shipping.']],
    [['Costos', 'Costs'], ['Se calculan según volumen, peso y destino, y se muestran en el pago con Stripe.', 'Calculated by volume, weight and destination, and shown at Stripe checkout.']],
    [['Plazos', 'Timing'], ['La preparación y entrega a la paquetería (FedEx, DHL, UPS o similar) toma de 2 a 5 días hábiles tras el pago completo. Recibirás tu guía al salir el paquete.', 'Preparation and hand-off to the courier (FedEx, DHL, UPS or similar) takes 2 to 5 business days after full payment. You will receive tracking once it ships.']],
    [['Aduanas', 'Customs'], ['En envíos internacionales, los aranceles del país de destino corren por cuenta del comprador.', 'For international shipments, destination customs duties are paid by the buyer.']],
  ] },
  { title: ['Devoluciones y daños', 'Returns and damage'], items: [
    [['Ventas finales', 'Final sales'], ['Al ser obras únicas y firmadas, todas las ventas son definitivas. No hay devoluciones por cambio de opinión.', 'As unique signed works, all sales are final. No returns for change of mind.']],
    [['Daños en tránsito', 'Transit damage'], ['Si la obra llega dañada, envíanos fotos del embalaje y de la pieza dentro de las 48 horas siguientes a la entrega para activar el seguro.', 'If the artwork arrives damaged, send us photos of the packaging and piece within 48 hours of delivery to activate the insurance.']],
  ] },
  { title: ['Propiedad intelectual', 'Intellectual property'], paragraphs: [['Comprar una obra original otorga la propiedad física de la pieza, pero no transfiere los derechos de autor, reproducción ni uso comercial, que siguen siendo de Josué Beltrán.', 'Buying an original artwork grants physical ownership of the piece but does not transfer copyright, reproduction or commercial rights, which remain with Josué Beltrán.']] },
  { title: ['Contacto', 'Contact'], items: [
    [['Correo', 'Email'], <a key="m" href="mailto:josue.beltran.u@gmail.com">josue.beltran.u@gmail.com</a>],
  ] },
]

export default function TerminosPage() {
  return (
    <InfoShell
      label={['JBU · Legal', 'JBU · Legal']}
      title={['Términos y condiciones', 'Terms of service']}
      intro={['Al navegar o comprar en josuebeltranuresti.com aceptas los siguientes términos.', 'By browsing or purchasing on josuebeltranuresti.com you agree to the following terms.']}
      updated={['Última actualización: julio de 2026', 'Last updated: July 2026']}
    >
      <InfoSections sections={sections} />
    </InfoShell>
  )
}
