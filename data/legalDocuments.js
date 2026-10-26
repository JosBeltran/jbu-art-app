const termsSections = [
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
    [['Correo', 'Email'], ['josue.beltran.u@gmail.com', 'josue.beltran.u@gmail.com']],
  ] },
]
const privacySections = [
  { title: ['Información que recopilamos', 'Information we collect'], paragraphs: [['Para procesar tus compras, gestionar envíos y comunicarnos contigo recopilamos:', 'To process your purchases, manage shipping and communicate with you, we collect:']], items: [
    [['Contacto', 'Contact'], ['Nombre completo, teléfono y correo electrónico.', 'Full name, phone number and email address.']],
    [['Entrega', 'Delivery'], ['Dirección de facturación y de envío completa (calle, número, código postal, ciudad, estado y país).', 'Full billing and shipping address (street, number, postal code, city, state and country).']],
    [['Navegación', 'Browsing'], ['Cuando aceptas analítica, registramos datos de navegación y uso para mejorar el sitio. No asumimos que todos los datos técnicos sean anónimos.', 'When you accept analytics, we record browsing and usage data to improve the site. We do not assume all technical data is anonymous.']],
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
    [['Correo', 'Email'], ['josue.beltran.u@gmail.com', 'josue.beltran.u@gmail.com']],
    [['Ubicación', 'Location'], ['Monterrey, Nuevo León, México.', 'Monterrey, Nuevo León, Mexico.']],
  ] },
]
privacySections.push({ title: ['Cuenta y consentimiento', 'Account and consent'], paragraphs: [
 ['La cuenta permite gestionar compras, ofertas, subastas, certificados digitales y colección. Guardamos fecha y versión de aceptación de términos y privacidad asociadas a tu usuario; no equivalen a consentimiento de marketing.', 'Your account manages purchases, offers, auctions, digital certificates and collection. We store the date and version of terms and privacy acceptance linked to your user; this is not marketing consent.'],
 ['Los servicios utilizados incluyen autenticación y almacenamiento de datos, Stripe para pagos, Resend para mensajes transaccionales, Vercel para alojamiento y analítica opcional, y Tidio para chat opcional. Google valida tu identidad si eliges ese acceso.', 'Services used include authentication and data storage, Stripe for payments, Resend for transactional messages, Vercel for hosting and optional analytics, and Tidio for optional chat. Google validates your identity if you choose that sign-in.'],
 ['Puedes cambiar o retirar permisos opcionales en Preferencias de cookies. Para consultas sobre tus datos o su conservación, escribe a josue.beltran.u@gmail.com.', 'You can change or withdraw optional permissions in Cookie preferences. For questions about your data or its retention, email josue.beltran.u@gmail.com.'],
] })
const cookieSections = [
 { title: ['Necesarias', 'Necessary'], paragraphs: [
 ['Siempre activas: cookies de autenticación y verificación de sesión (sb-…-auth-token y posibles fragmentos), intercambio seguro del acceso con Google, carrito y continuidad de acciones solicitadas. Stripe puede utilizar tecnologías de seguridad en el pago externo.', 'Always active: authentication and session verification cookies (sb-…-auth-token and possible chunks), secure Google sign-in exchange, cart and continuity of requested actions. Stripe may use security technologies during external checkout.'],
 ['El navegador también guarda idioma, tema, retorno de acceso y preferencias de cookies. La preferencia de cookies se guarda como jbu-cookie-consent con categorías, fecha y versión 1.0.', 'The browser also stores language, theme, sign-in return and cookie preferences. Cookie choices are stored as jbu-cookie-consent with categories, date and version 1.0.'],
 ] },
 { title: ['Analítica opcional', 'Optional analytics'], paragraphs: [
 ['Solo se activa tras tu aceptación: Vercel Analytics y los contadores de vistas y acciones de compartir de obras. Vercel Analytics es medición sin cookies publicitarias; aun así respetamos tu elección de analítica.', 'Enabled only after your acceptance: Vercel Analytics and artwork view and share counters. Vercel Analytics measures without advertising cookies; we still respect your analytics choice.'],
 ] },
 { title: ['Marketing y chat opcional', 'Marketing and optional chat'], paragraphs: [
 ['No se han identificado píxeles de Google Analytics ni Meta en el código. La categoría está preparada para tecnologías futuras, que requerirán actualizar este aviso. Actualmente también controla el chat Tidio: no cargamos su código ni sus tecnologías antes de tu aceptación.', 'No Google Analytics or Meta pixels were identified in the code. The category is prepared for future technologies, which require updating this notice. It currently also controls Tidio chat: we do not load its code or technologies before your acceptance.'],
 ['Las tecnologías de terceros y su duración pueden variar. Esta descripción se basa en el código; no es un inventario certificado de todas las cookies que los proveedores puedan establecer.', 'Third-party technologies and their duration may vary. This description is based on source code; it is not a certified inventory of every cookie providers may set.'],
 ] },
 { title: ['Cambiar o retirar preferencias', 'Change or withdraw preferences'], paragraphs: [
 ['Abre Preferencias de cookies en el pie de página y guarda nuevas opciones o selecciona Solo necesarias. La retirada bloquea nueva medición opcional; si retiras el chat, recargamos la página para descargarlo por completo. No borra datos ya enviados ni cookies de terceros fuera del control del sitio.', 'Open Cookie preferences in the footer and save new choices or select Necessary only. Withdrawal blocks new optional measurement; withdrawing chat reloads the page to fully unload it. It does not erase data already sent or third-party cookies outside the site’s control.'],
 ['Conservamos tu elección en este navegador hasta que la cambies, elimines su almacenamiento o cambie la versión del aviso. No vinculamos esta preferencia anónima a tu cuenta.', 'We retain your choice in this browser until you change it, clear browser storage or the notice version changes. We do not link this anonymous preference to your account.'],
 ] },
 { title: ['Contacto', 'Contact'], paragraphs: [['josue.beltran.u@gmail.com', 'josue.beltran.u@gmail.com']] },
]
export const legalDocuments = {
  terms: { title: ['Términos y Condiciones', 'Terms and Conditions'], intro: ['Condiciones de uso y compra de JBU · Estudio JBU.', 'Terms of use and purchase at JBU · Estudio JBU.'], version: '1.0', sections: termsSections },
  privacy: { title: ['Aviso de Privacidad', 'Privacy Notice'], intro: ['Qué información recopilamos, cómo la usamos y cuáles son tus derechos.', 'What information we collect, how we use it and what your rights are.'], version: '1.0', sections: privacySections },
  cookies: { title: ['Política de Cookies', 'Cookie Policy'], intro: ['Cookies, tecnologías similares y tus preferencias en JBU.', 'Cookies, similar technologies and your preferences at JBU.'], version: '1.0', sections: cookieSections },
}
