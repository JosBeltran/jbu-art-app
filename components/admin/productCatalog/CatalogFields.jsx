'use client'

import { Button, InlineLoading, InlineNotification, Select, SelectItem, TextArea, TextInput } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import styles from './ProductCatalog.module.css'

export const named = (event, field) => event.currentTarget.elements.namedItem(field)?.value || ''

export function CatalogFeedback({ busy, error }) {
  const { t } = useI18n()
  const messages = {
    gelato_catalog_invalid_json: t('Gelato devolvió una respuesta ilegible al consultar catálogos.', 'Gelato returned an unreadable response while loading catalogs.'),
    gelato_catalog_invalid_list: t('La respuesta de Gelato no contiene una lista de catálogos.', 'The Gelato response does not contain a catalog list.'),
    gelato_catalog_invalid_id: t('Gelato devolvió un catálogo sin un identificador válido.', 'Gelato returned a catalog without a valid identifier.'),
    gelato_catalog_not_found: t('Gelato no encontró ese catálogo. Consulta las categorías y selecciona otra opción.', 'Gelato could not find that catalog. Reload the catalogs and choose another option.'),
    gelato_catalog_required: t('Selecciona un catálogo de Gelato para buscar productos.', 'Select a Gelato catalog to search for products.'),
    configured_variant_attribute_locked: t('Los atributos de producción están vinculados a la configuración verificada. Usa Product Studio para seleccionar otra configuración.','Production attributes are bound to the verified configuration. Use Product Studio to select another configuration.'),
    native_configuration_changed: t('Una configuración cambió o dejó de estar disponible. Regresa a Configuración, actualiza la matriz y revisa las selecciones.','A configuration changed or became unavailable. Return to Configuration, refresh the matrix and review the selections.'),
    provider_not_configured: t('Configura la clave del proveedor en el servidor.', 'Configure the provider key on the server.'),
    provider_rate_limited: t('El proveedor limitó las consultas. Inténtalo más tarde.', 'The provider rate-limited requests. Try again later.'),
    explicit_tax_assumption_required: t('Indica el impuesto estimado o confirma un valor de cero.', 'Enter an explicit tax estimate, or confirm a value of zero.'),
    fresh_exchange_rate_required: t('La cotización y la lista usan monedas distintas. Se necesita un tipo de cambio documentado.', 'The quote and book use different currencies. A documented exchange rate is required.'),
    catalog_unavailable: t('El catálogo no está disponible. Comprueba las migraciones y vuelve a intentar.', 'The catalog is unavailable. Check the migrations and try again.'),
  }
  return <>
    {error && <InlineNotification lowContrast kind="error" hideCloseButton title={messages[error] || error.replaceAll('_', ' ')} />}
    {busy && <InlineLoading description={t('Procesando…', 'Working…')} />}
  </>
}

export function BookSelect({ books, id = 'price-book', disabled }) {
  const { t } = useI18n()
  return <Select id={id} name="book" labelText={t('Lista de precios', 'Price book')} disabled={disabled} required>
    <SelectItem value="" text={t('Seleccionar', 'Select')} />
    {books.filter(book => ['draft','active'].includes(book.status)).map(book =>
      <SelectItem key={book.id} value={book.id} text={[book.name, book.currency, book.country].filter(Boolean).join(' · ')} />)}
  </Select>
}

export function VariantFields({ prefix, fixedProvider = false }) {
  const { t } = useI18n()
  return <>
    <TextInput id={prefix + '-variant-sku'} name="variantSku" labelText="SKU de variante / Variant SKU" required maxLength={100} />
    {!fixedProvider && <>
      <Select id={prefix + '-fulfillment'} name="fulfillment" labelText={t('Preparación', 'Fulfillment')}>
        <SelectItem value="manual" text="Manual" /><SelectItem value="provider" text={t('Proveedor', 'Provider')} />
        <SelectItem value="digital" text="Digital" />
      </Select>
      <Select id={prefix + '-inventory'} name="inventory" labelText={t('Inventario', 'Inventory')}>
        <SelectItem value="made_to_order" text={t('Bajo pedido', 'Made to order')} />
        <SelectItem value="finite" text={t('Finito', 'Finite')} /><SelectItem value="unlimited" text={t('Sin límite', 'Unlimited')} />
      </Select>
    </>}
  </>
}
export const variantFrom = event => ({ sku: named(event, 'variantSku'), fulfillmentType: named(event, 'fulfillment') || 'provider',
  inventoryPolicy: named(event, 'inventory') || 'made_to_order' })

export function DraftForm({ families, artworkId, candidateId, initialTitle, disabled, onSave }) {
  const { t, lang } = useI18n()
  return <form className={styles.fields} onSubmit={event => {
    event.preventDefault()
    onSave({ artworkId, candidateId, product: { sku: named(event, 'sku'), family: named(event, 'family'),
      titleEs: named(event, 'titleEs'), titleEn: named(event, 'titleEn') || undefined,
      descriptionEs: named(event, 'descriptionEs') || undefined, descriptionEn: named(event, 'descriptionEn') || undefined },
    variant: variantFrom(event) })
  }}>
    <fieldset disabled={disabled} className={styles.fields}>
      <Select id="draft-family" name="family" labelText={t('Familia', 'Family')} defaultValue={candidateId ? 'fine_art_print' : 'merchandise'} required>
        {families.map(family => <SelectItem key={family.code} value={family.code} text={lang === 'en' ? family.label_en : family.label_es} />)}
      </Select>
      <TextInput id="draft-sku" name="sku" labelText={t('SKU de producto', 'Product SKU')} required maxLength={100} />
      <TextInput id="draft-title-es" name="titleEs" labelText={t('Título en español', 'Spanish title')} required defaultValue={initialTitle || ''} maxLength={240} />
      <TextInput id="draft-title-en" name="titleEn" labelText={t('Título en inglés', 'English title')} maxLength={240} />
      <TextArea id="draft-description-es" name="descriptionEs" labelText={t('Descripción en español', 'Spanish description')} rows={2} maxLength={4000} />
      <TextArea id="draft-description-en" name="descriptionEn" labelText={t('Descripción en inglés', 'English description')} rows={2} maxLength={4000} />
      <VariantFields prefix="draft" fixedProvider={Boolean(candidateId)} />
    </fieldset>
    <Button type="submit" disabled={disabled || !families.length}>{t('Crear borrador', 'Create draft')}</Button>
  </form>
}
