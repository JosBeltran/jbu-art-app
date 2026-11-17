'use client'
import { useId, useRef, useState } from 'react'
import { Button, ComboBox, Modal } from '@carbon/react'
import { Earth } from '@carbon/icons-react'
import { useMarket } from './MarketProvider'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { useI18n } from '@/components/I18nProvider'
import { countryNames } from '@/lib/shippingCountries'
import ThemedOverlay from '@/components/overlays/ThemedOverlay'
import styles from './MarketSelector.module.css'
export default function MarketSelector() {
  const { country, setCountry, ready } = useMarket(),
    { globalCountries } = useShipping(),
    { t, locale } = useI18n(),
    id = useId()
  const launcherRef = useRef(null)
  const [open, setOpen] = useState(false),
    [choice, setChoice] = useState(null)
  const items = globalCountries
    .map((code) => ({
      code,
      label: `${countryNames([code], locale)} (${code})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
  return (
    <>
      <button
        ref={launcherRef}
        className={styles.trigger}
        type="button"
        disabled={!ready || !items.length}
        aria-label={
          t('País de compra', 'Shopping country') +
          (country ? `: ${countryNames([country], locale)}` : '')
        }
        onClick={() => {
          setChoice(country)
          setOpen(true)
        }}
      >
        <Earth size={20} />
        <span>{country || t('Destino', 'Ship to')}</span>
      </button>
      <ThemedOverlay open={open} carbon initialFocus="input" onClose={() => setOpen(false)}>
      <Modal
        launcherButtonRef={launcherRef}
        selectorPrimaryFocus="input"
        closeButtonLabel={t('Cerrar', 'Close')}
        preventCloseOnClickOutside
        open={open}
        modalHeading={t('Tu país de compra', 'Your shopping country')}
        primaryButtonText={t('Guardar destino', 'Save destination')}
        primaryButtonDisabled={!choice}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        onRequestClose={() => setOpen(false)}
        onRequestSubmit={() => {
          setCountry(choice)
          setOpen(false)
        }}
      >
        <p className={styles.description}>
          {t(
            'La disponibilidad y el envío se ajustan a tu destino. Puedes elegir el idioma por separado.',
            'Availability and shipping follow your destination. Language is a separate preference.'
          )}
        </p>
        <ComboBox
          id={`market-${id}`}
          titleText={t('País de entrega', 'Delivery country')}
          placeholder={t('Buscar por país o código', 'Search country or code')}
          items={items}
          itemToString={(item) => item?.label || ''}
          selectedItem={items.find((item) => item.code === choice) || null}
          onChange={({ selectedItem }) => setChoice(selectedItem?.code || null)}
        />
        <Button
          kind="ghost"
          className={styles.reset}
          onClick={() => {
            setCountry(null)
            setOpen(false)
          }}
        >
          {t(
            'Explorar sin destino seleccionado',
            'Browse without a selected destination'
          )}
        </Button>
      </Modal>
      </ThemedOverlay>
    </>
  )
}
