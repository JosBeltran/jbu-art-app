'use client'

import { useState } from 'react'
import { Modal, TextInput, TextArea, InlineNotification } from '@carbon/react'

export default function MakeOfferModal({ isOpen, onClose, artwork }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
    artworkId: artwork.id,
    userId: user?.id || null, // <-- Asegúrate de incluirlo si lo tienes disponible
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
      onRequestClose={() => {
        setSuccess(false)
        setErrorMessage('')
        onClose()
      }}
      modalHeading={`Hacer una oferta por: ${artwork?.title || 'Obra'}`}
      modalLabel="Negociación directa con el artista"
      primaryButtonText={success ? "Cerrar" : (submitting ? "Enviando..." : "Enviar Propuesta")}
      secondaryButtonText="Cancelar"
      onRequestSubmit={success ? onClose : handleSubmit}
    >
      {success ? (
        <div className="py-4">
          <InlineNotification
            kind="success"
            title="¡Oferta enviada con éxito!"
            subtitle="Gracias por tu interés. El artista evaluará tu propuesta y se pondrá en contacto contigo por correo."
            lowContrast
          />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMessage && (
            <InlineNotification
              kind="error"
              title="Error"
              subtitle={errorMessage}
              lowContrast
              className="mb-4"
            />
          )}

          <p className="text-sm text-[var(--cds-text-secondary)] mb-4">
            Precio de lista: <span className="font-semibold text-[var(--cds-text-primary)]">${artwork?.calculated_price_mxn?.toLocaleString()} MXN</span>. Ingresa tu propuesta económica y tus datos de contacto.
          </p>

          <TextInput
            id="offer-name"
            labelText="Tu Nombre"
            placeholder="Nombre completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <TextInput
            id="offer-email"
            labelText="Correo Electrónico"
            type="email"
            placeholder="tucorreo@ejemplo.com"
            value= {email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <TextInput
            id="offer-amount"
            labelText="Tu Oferta en MXN ($)"
            type="number"
            placeholder="Ej. 12000"
            value={offerAmount}
            onChange={(e) => setOfferAmount(e.target.value)}
            required
          />

          <TextArea
            id="offer-message"
            labelText="Mensaje adicional (Opcional)"
            placeholder="Comentarios sobre la propuesta, método de entrega o dudas..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
        </form>
      )}
    </Modal>
  )
}