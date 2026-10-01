import { Button } from './primitives.jsx'
import { canPickWhatsApp } from '../lib/matching.js'

/**
 * The send button of every WhatsApp hand-off. On Android it is two, WhatsApp
 * and Business, because a wa.me link always opened the personal app on a
 * phone that has both (lib/matching.js `openWhatsAppChat`). Elsewhere it is
 * the one button with the screen's own label. `onSend(app)` gets 'personal',
 * 'business' or undefined.
 */
export default function WaSend({ label, onSend, disabled, className, style }) {
  if (!canPickWhatsApp()) {
    return <Button variant="primary" icon="wa" className={className} style={style} disabled={disabled} onClick={() => onSend()}>{label}</Button>
  }
  return (
    <>
      <Button variant="primary" icon="wa" className={className} style={style} disabled={disabled} onClick={() => onSend('personal')}>WhatsApp</Button>
      <Button variant="primary" icon="wa" className={className} style={style} disabled={disabled} onClick={() => onSend('business')}>Business</Button>
    </>
  )
}
