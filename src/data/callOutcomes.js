// The outcomes a logged call can have. One list — it was typed out twice
// (the outreach modal and the contact-confirm modal) with the same five
// strings, which is how two lists silently become two different lists.
//
// `value` is what is stored on the timeline event; `label` is the only string
// ever shown. Adding an outcome here adds it everywhere.
const o = (value, label) => ({ value, label })

export const CALL_OUTCOMES = [
  o('discussed', 'Connected · discussed requirements'),
  o('visit', 'Interested · scheduling a site visit'),
  o('callback', 'Asked to call back'),
  o('no_answer', 'No answer'),
  o('unreachable', 'Busy or switched off'),
  o('wrong_number', 'Wrong number'),
  o('not_interested', 'Not interested'),
]

export const labelForOutcome = (value) =>
  CALL_OUTCOMES.find(x => x.value === value)?.label || ''
