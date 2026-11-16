import { formatMoney } from './currency.js'
import { isPhysicalItem } from './shippingCountries.js'
export function productBenefits(item) {
  if (!isPhysicalItem(item)) return ['digital', 'secure']
  if (item.type === 'ORIGINAL')
    return ['certificate', 'provenance', 'shipping', 'secure']
  const benefits = []
  if (String(item.edition_type).toUpperCase() === 'LIMITED')
    benefits.push('limited')
  if (item.is_hand_embellished === true) benefits.push('embellished')
  if (item.is_signed === true && item.is_numbered === true)
    benefits.push('signed')
  if (item.certificate_enabled === true) benefits.push('certificate')
  if (item.paper_type) benefits.push('specifications')
  return [...benefits, 'shipping', 'secure']
}
export function shippingBenefitLabel(option, t, locale) {
  const money = formatMoney(
    option.amount / 100,
    option.currency.toUpperCase(),
    locale
  )
  switch (option.method) {
    case 'INCLUDED':
      return t('Envío incluido', 'Shipping included')
    case 'BUYER_ARRANGED':
      return (
        t('Organiza tu propio envío', 'Arrange your own shipping') +
        (option.amount ? ` · ${t('Gestión', 'Handling')}: ${money}` : '')
      )
    case 'LOCAL_PICKUP':
      return (
        t('Recogida local', 'Local pickup') +
        (option.amount ? ` · ${money}` : '')
      )
    case 'LOCAL_DELIVERY':
      return (
        t('Entrega local', 'Local delivery') +
        (option.amount ? ` · ${money}` : '')
      )
    default:
      return `${t('Envío', 'Shipping')}: ${money}`
  }
}
