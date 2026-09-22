'use client'

import { useEffect, useState } from 'react'
import { Modal, TextInput, TextArea, InlineNotification, NumberInput, Tag } from '@carbon/react'
import styles from './MakeOfferModal.module.css'

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')}`

export default function MakeOfferModal({ isOpen, onClose, artwork, currentUser = null }) {
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
      setErrorMessage('Completa tu nombre, correo y el monto de tu oferta.')
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
        setErrorMessage(data.error || 'Hubo un error al enviar la oferta.')
      }
    } catch (err) {
      console.error(err)
      setErrorMessage('Error de conexión con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onRequestClose={handleClose}
      modalHeading={artwork?.title || 'Obra'}
      modalLabel="Hacer una oferta"
      primaryButtonText={success ? 'Cerrar' : submitting ? 'Enviando...' : 'Enviar propuesta'}
      secondaryButtonText={success ? '' : 'Cancelar'}
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
          title="¡Oferta enviada!"
          subtitle="El artista evaluará tu propuesta y te contactará por correo."
        />
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          {errorMessage && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="No se pudo enviar"
              subtitle={errorMessage}
            />
          )}

          <div className={styles.priceRow}>
            <div>
              <span className={styles.priceLabel}>Precio de lista</span>
              <span className={styles.price}>{money(listPrice)} MXN</span>
            </div>
            <Tag type="cool-gray" size="sm">{artwork?.sku}</Tag>
          </div>

          <p className={styles.help}>
            Envía tu propuesta económica y tus datos de contacto. La negociación es directa con el artista.
          </p>

          <div className={styles.grid}>
            <TextInput
              id="offer-name"
              labelText="Tu nombre"
              placeholder="Nombre completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <TextInput
              id="offer-email"
              labelText="Correo electrónico"
              type="email"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <NumberInput
            id="offer-amount"
            label="Tu oferta en MXN"
            helperText="Monto total en pesos mexicanos."
            min={0}
            step={500}
            hideSteppers={false}
            value={offerAmount === '' ? 0 : Number(offerAmount)}
            onChange={(_e, state) => setOfferAmount(String(state?.value ?? ''))}
          />

          <TextArea
            id="offer-message"
            labelText="Mensaje adicional (opcional)"
            placeholder="Comentarios sobre la propuesta, entrega o dudas..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
        </form>
      )}
    </Modal>
  )
}
