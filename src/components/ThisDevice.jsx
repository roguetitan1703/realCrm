import PushRow from './PushRow.jsx'
import Install from './Install.jsx'

/**
 * THIS DEVICE — alerts and install, one shape, one section.
 *
 * They were two: a card called "Alerts" with a bell row in it, and a separate
 * "This device" section holding the install row, on the desk; and one card
 * called "App & Push Alerts" on the phone with its own markup. Three headings
 * for two facts about the phone in your hand.
 *
 * Both rows answer the same kind of question — can this device do the thing,
 * and if not what is there to press — so they are the same row, under one
 * heading, in both places.
 *
 * The wrapper hides itself when both rows render nothing (`:empty` in
 * styles.css). A card with a heading and no contents is the fault this section
 * shipped with: `PushRow` returned null while it was still looking the worker
 * up, and the panel around it rendered regardless.
 */
export default function ThisDevice({ store }) {
  return (
    <div className="devcard">
      <PushRow store={store} variant="row" />
      <Install variant="row" />
    </div>
  )
}
