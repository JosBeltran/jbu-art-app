'use client'
import {Button} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {paymentState} from '@/lib/payments/pending'
import {formatMXN} from '@/lib/auctions'
import styles from './Auction.module.css'
export default function PendingPayment({payment,userId,now,busy,onPay}){
 const {t,locale}=useI18n(),state=paymentState(payment,userId,now+(payment?.clock_offset||0))
 if(state==='NONE')return null
 return <div className={styles.won}><p className={styles.wonTitle}>{payment.source==='OFFER'?t('Tu oferta fue aceptada','Your offer was accepted'):t('Ganaste','You won')}</p>
 {state==='PAID'?<p className={styles.muted}>{t('Pago recibido. Gracias por tu adquisición.','Payment received. Thank you for your acquisition.')}</p>:state==='EXPIRED'?<p className={styles.muted}>{t('El plazo de pago venció.','The payment deadline has expired.')}</p>:<><p className={styles.muted}>{t('Completa el pago para asegurar la obra','Complete payment to secure the artwork')} · {t('antes del','before')} {new Date(payment.payment_due_at).toLocaleString(locale)}</p><Button className={styles.fullButton} disabled={busy} onClick={onPay}>{t('Completar compra','Complete purchase')} · {formatMXN(payment.amount,locale)}</Button></>}
 </div>
}
