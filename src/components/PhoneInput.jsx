import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { firmLocale } from '../lib/locale.js'
import { readPhone, phoneProblem, callingCode, phoneCountries } from '../lib/phone.js'

// THE PHONE BOX, in its own file: it brings the number reader (lib/phone.js,
// ~50 kB gzipped), and primitives.jsx is loaded by the buyer's pages, which
// must not pay for it on first paint (docs/specs/phone.md).

/** What the picked country's number looks like, where the firm has said so. */
const PHONE_EXAMPLE = { IN: '98765 43210', US: '512 555 0143' }
const HAS_CODE = /^(\+|00)/

/** The box's starting state for a stored or sent value. */
function phoneState(value) {
  const firm = firmLocale().country
  const v = String(value ?? '').trim()
  if (!v) return { country: firm, text: '' }
  const r = readPhone(v, firm)
  if (!r.ok || !r.country) return { country: firm, text: v }
  return { country: r.country, text: r.e164.slice(callingCode(r.country).length) }
}

/** What the parent keeps: E.164 once it reads, else what was typed behind the picked code. */
function phoneValue(text, country) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  const r = readPhone(t, country)
  if (r.ok) return r.e164
  return HAS_CODE.test(t) ? t : `${callingCode(country)} ${t}`
}

/**
 * A PHONE NUMBER WITH ITS COUNTRY (docs/specs/phone.md). The picker starts on
 * the firm's country; a number typed or pasted with its code ("+971…",
 * "00971…") moves the picker to it. onChange gets `{ target: { value },
 * problem }`: the value is exact E.164 once it can be read, else what was
 * typed behind the picked code, which the server refuses with the same reason
 * shown here. The reason shows once the box is left, or when `showProblem`
 * (after a Save was tried).
 */
export default function PhoneInput({ value, onChange, showProblem = false, onBlur, id, ...rest }) {
  const [st, setSt] = useState(() => phoneState(value))
  const [left, setLeft] = useState(false)
  const sent = useRef(value ?? '')
  // The parent set a number itself (Paste, Pick from contacts, a reset).
  useEffect(() => {
    if ((value ?? '') !== sent.current) { sent.current = value ?? ''; setSt(phoneState(value)) }
  }, [value])
  const countries = useMemo(() => {
    const all = phoneCountries()
    const firm = firmLocale().country
    return [...all.filter(c => c.code === firm), ...all.filter(c => c.code !== firm)]
  }, [])
  const emit = ({ text, country }) => {
    // A number with its own code moves the picker to that country.
    if (HAS_CODE.test(text.trim())) {
      const r = readPhone(text, country)
      if (r.ok && r.country) { country = r.country; text = r.e164.slice(callingCode(r.country).length) }
    }
    setSt({ text, country })
    const v = phoneValue(text, country)
    sent.current = v
    onChange?.({ target: { value: v }, problem: phoneProblem(text, country) })
  }
  const problem = (left || showProblem) ? phoneProblem(st.text, st.country) : ''
  return (
    <div className="phone-in">
      <div className={'input-group' + (problem ? ' err' : '')}>
        <label className="prefix phone-cc">
          <span>{callingCode(st.country)}</span>
          <Icon name="chevDown" size={12} />
          <select value={st.country} aria-label="Country" onChange={e => emit({ ...st, country: e.target.value })}>
            {countries.map(c => <option key={c.code} value={c.code}>{c.name} {c.dial}</option>)}
          </select>
        </label>
        <input id={id} value={st.text} inputMode="tel" autoComplete="tel"
          placeholder={PHONE_EXAMPLE[st.country] || ''}
          onChange={e => emit({ ...st, text: e.target.value })}
          onBlur={e => { setLeft(true); onBlur?.(e) }} {...rest} />
      </div>
      {problem && <div className="err-msg" role="alert">{problem}</div>}
    </div>
  )
}
