/**
 * Builds a stable identifier for an individual physical limited-edition unit.
 *
 * This is a pure formatter, NOT a sequence allocator. The edition number must
 * be allocated transactionally by the database before this is used in orders,
 * certificates or fulfillment.
 *
 * Existing artwork SKUs, URLs and print SKUs are intentionally unchanged.
 */
export function physicalEditionUnitIdentifier(artworkSku, editionNumber, editionSize) {
  const sku = String(artworkSku ?? '').trim()
  const number = Number(editionNumber)
  const size = Number(editionSize)

  if (!sku || !Number.isSafeInteger(number) || number < 1 ||
      !Number.isSafeInteger(size) || size < 1 || number > size) {
    throw new RangeError('Invalid artwork SKU or physical edition number/size')
  }

  const width = Math.max(3, String(size).length)
  return `${sku}-${String(number).padStart(width, '0')}`
}
