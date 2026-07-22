import Icon from '../components/Icon.jsx'

const LIVE = [
  ['Lead capture & routing', 'New leads land, auto-tag by source, round-robin to agents — out of Excel, into one system.'],
  ['Requirement → property matching', 'Every buyer matched to your live inventory with weighted scoring across budget, locality, config & amenities.'],
  ['WhatsApp property messages', 'Ready-to-send property details in Hinglish, English & Marathi — filled from your listing, opened straight in WhatsApp.'],
  ['Agent management & handover', "Reassign an agent's whole pipeline in one action. No client is ever lost."],
  ['Site-visit calendar & reminders', 'Every visit and follow-up in one agenda, with native nudges and ISO date support.'],
]
const NEXT = [
  ['WhatsApp Business API (WABA)', 'Send from your own verified business number, with delivery receipts — subject to Meta approval.'],
  ['Portal & telephony integrations', '99acres / MagicBricks auto-import and click-to-call — built and ready to switch on per account.'],
  ['AI Inbound Voice Qualifier', 'Automated conversational qualification for after-hours buyer inquiries.'],
  ['RERA Document OCR Auto-Check', 'Automatic verification of title deeds and project RERA registrations.'],
  ['Renewal & repeat-business engine', 'Auto-nudge to re-approach past clients and lease renewals at the right time.'],
]
const LATER = [
  ['Deal value, commission & finance', 'Booking value, commission splits and payouts — integrate, not bolt-on.'],
  ['Marketing & campaign tools', 'Bulk broadcasts and attribution — separate track, priced on its own.'],
]

function Col({ title, tag, items, done }) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>{title}</div>
        <span className="u-spring" />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: done ? 'var(--accent)' : 'var(--muted)', background: done ? 'var(--accent-wash)' : 'var(--line-2)', borderRadius: 5, padding: '3px 8px' }}>{tag}</span>
      </div>
      {items.map(([h, s]) => (
        <div key={h} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name={done ? 'check' : 'clock'} size={16} style={{ color: done ? 'var(--accent)' : 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
          <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{h}</div><div className="u-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{s}</div></div>
        </div>
      ))}
    </div>
  )
}

export default function Roadmap({ topBar }) {
  return (
    <>
      {topBar({ title: 'Roadmap' })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div style={{ maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--chrome)', color: '#fff', borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 16 }}>Built for how a Pune brokerage actually runs</div>
            <div style={{ fontSize: 13, color: 'var(--on-chrome-mut)', marginTop: 5, lineHeight: 1.5, maxWidth: 720 }}>We're solving two things the big legacy systems treat as afterthoughts: getting your business out of fragmented Excel, and helping you run your agents. Here's what's live today and what's next.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
            <Col title="Live in this system" tag="Live" items={LIVE} done />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Col title="Next up (Block 2)" tag="Next" items={NEXT} />
              <Col title="Later / integrate" tag="Later" items={LATER} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
