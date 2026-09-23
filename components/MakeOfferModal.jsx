'use client'

import { useEffect, useState } from 'react'
import { Modal, TextInput, TextArea, InlineNotification, NumberInput, Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import styles from './MakeOfferModal.module.css'

const money = (value, locale) => `$${Number(value || 0).toLocaleString(locale)}`

export default function MakeOfferModal({ isOpen, onClose, artwork, currentUser = null }) {
  const { t, locale } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const listPrice = artwork?.calculated_price_mxn || artwork?.base_price_mxn || 0

  useEffect(() => {
    if (!isOpen) return
    if (currentUser?.email && !email) setEmail(currentUser.email)
    if (currentUser?.user_metadata?.full_name && !name) setName(currentUser.user_metadata.full_name)
  }, [isOpen, currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setSuccess(false)
    setErrorMessage('')
    onClose()
  }

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    setErrorMessage('')

    if (!name.trim() || !email.trim() || !offerAmount) {
      setErrorMessage(t('Completa tu nombre, correo y el monto de tu oferta.', 'Please fill in your name, email, and offer amount.'))
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworkId: artwork?.id,
          userId: currentUser?.id || null,
          name,
          email,
          offerAmount,
          message
        })
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(true)
      } else {
        setErrorMessage(data.error || t('Hubo un error al enviar la oferta.', 'There was an error sending the offer.'))
      }
    } catch (err) {
      console.error(err)
      setErrorMessage(t('Error de conexión con el servidor.', 'Connection error with the server.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onRequestClose={handleClose}
      modalHeading={artwork?.title || t('Obra', 'Artwork')}
      modalLabel={t('Hacer una oferta', 'Make an offer')}
      primaryButtonText={success ? t('Cerrar', 'Close') : submitting ? t('Enviando...', 'Sending...') : t('Enviar propuesta', 'Send proposal')}
      secondaryButtonText={success ? '' : t('Cancelar', 'Cancel')}
      passiveModal={false}
      primaryButtonDisabled={submitting}
      onSecondarySubmit={handleClose}
      onRequestSubmit={success ? handleClose : handleSubmit}
    >
      {success ? (
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title={t('¡Oferta enviada!', 'Offer sent!')}
          subtitle={t('El artista evaluará tu propuesta y te contactará por correo.', 'The artist will review your proposal and contact you by email.')}
        />
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          {errorMessage && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={t('No se pudo enviar', 'Could not send')}
              subtitle={errorMessage}
            />
          )}

          <div className={styles.priceRow}>
            <div>
              <span className={styles.priceLabel}>{t('Precio de lista', 'List price')}</span>
              <span className={styles.price}>{money(listPrice, locale)} MXN</span>
            </div>
            <Tag type="cool-gray" size="sm">{artwork?.sku}</Tag>
          </div>

          <p className={styles.help}>
            {t('Envía tu propuesta económica y tus datos de contacto. La negociación es directa con el artista.', 'Send your financial proposal and contact details. Negotiation is directly with the artist.')}
          </p>

          <div className={styles.grid}>
            <TextInput
              id="offer-name"
              labelText={t('Tu nombre', 'Your name')}
              placeholder={t('Nombre completo', 'Full name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <TextInput
              id="offer-email"
              labelText={t('Correo electrónico', 'Email')}
              type="email"
              placeholder={t('tucorreo@ejemplo.com', 'youremail@example.com')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <NumberInput
            id="offer-amount"
            label={t('Tu oferta en MXN', 'Your offer in MXN')}
            helperText={t('Monto total en pesos mexicanos.', 'Total amount in Mexican pesos.')}
            min={0}
            step={500}
            hideSteppers={false}
            value={offerAmount === '' ? 0 : Number(offerAmount)}
            onChange={(_e, state) => setOfferAmount(String(state?.value ?? ''))}
          />

          <TextArea
            id="offer-message"
            labelText={t('Mensaje adicional (opcional)', 'Additional message (optional)')}
            placeholder={t('Comentarios sobre la propuesta, entrega o dudas...', 'Comments about the proposal, delivery, or questions...')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
        </form>
      )}
    </Modal>
  )
}
