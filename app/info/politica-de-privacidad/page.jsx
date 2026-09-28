'use client'

import { InfoShell, InfoSections } from '../InfoPage'

const sections = [
  { title: ['Información que recopilamos', 'Information we collect'], paragraphs: [['Para procesar tus compras, gestionar envíos y comunicarnos contigo recopilamos:', 'To process your purchases, manage shipping and communicate with you, we collect:']], items: [
    [['Contacto', 'Contact'], ['Nombre completo, teléfono y correo electrónico.', 'Full name, phone number and email address.']],
    [['Entrega', 'Delivery'], ['Dirección de facturación y de envío completa (calle, número, código postal, ciudad, estado y país).', 'Full billing and shipping address (street, number, postal code, city, state and country).']],
    [['Navegación', 'Browsing'], ['Dirección IP y datos de uso, de forma anónima, para mejorar el sitio.', 'IP address and usage data, anonymously, to improve the site.']],
  ] },
  { title: ['Uso de los datos', 'How we use your data'], items: [
    [['01', '01'], ['Procesar, preparar, asegurar y coordinar el envío de las obras adquiridas.', 'Process, prepare, insure and coordinate the shipping of purchased artworks.']],
    [['02', '02'], ['Enviarte actualizaciones del estado y rastreo del paquete.', 'Send you shipping status and tracking updates.']],
    [['03', '03'], ['Dar soporte y responder tus consultas de postventa.', 'Provide support and answer your after-sale questions.']],
    [['04', '04'], ['Cumplir obligaciones fiscales y legales de la compraventa nacional o internacional.', 'Comply with tax and legal obligations of domestic or international sales.']],
  ] },
  { title: ['Pagos seguros con Stripe', 'Secure payments with Stripe'], paragraphs: [['Todos los pagos se procesan de forma externa y segura con Stripe. Nunca tenemos acceso ni almacenamos los datos de tus tarjetas o cuentas bancarias. Las transacciones cumplen el estándar PCI-DSS.', 'All payments are processed externally and securely by Stripe. We never access or store your card or bank details. Transactions follow the PCI-DSS standard.']] },
  { title: ['Terceros', 'Third parties'], paragraphs: [['Tus datos no se comparten, venden ni alquilan, salvo:', 'Your data is never shared, sold or rented, except with:']], items: [
    [['Paquetería', 'Couriers'], ['Solo para entregar tu pedido.', 'Only to deliver your order.']],
    [['Stripe', 'Stripe'], ['Como procesador de pagos.', 'As payment processor.']],
    [['Autoridades', 'Authorities'], ['Cuando la ley lo requiera.', 'When required by law.']],
  ] },
  { title: ['Derechos ARCO', 'Your rights (ARCO)'], paragraphs: [['Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos en cualquier momento escribiendo al correo de soporte.', 'You may access, correct, cancel or object to the processing of your data at any time by writing to our support email.']] },
  { title: ['Contacto', 'Contact'], items: [
    [['Responsable', 'Data controller'], ['Josué Beltrán Uresti', 'Josué Beltrán Uresti']],
    [['Correo', 'Email'], <a key="m" href="mailto:soporte@josuebeltranuresti.com">soporte@josuebeltranuresti.com</a>],
    [['Ubicación', 'Location'], ['Monterrey, Nuevo León, México.', 'Monterrey, Nuevo León, Mexico.']],
  ] },
]

export default function PrivacidadPage() {
  return (
    <InfoShell
      label={['JBU · Legal', 'JBU · Legal']}
      title={['Política de privacidad', 'Privacy policy']}
      intro={['Qué información recopilamos, cómo la usamos y cuáles son tus derechos.', 'What information we collect, how we use it and what your rights are.']}
      updated={['Última actualización: julio de 2026', 'Last updated: July 2026']}
    >
      <InfoSections sections={sections} />
    </InfoShell>
  )
}
