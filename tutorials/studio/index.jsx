import { Composition, registerRoot, staticFile } from 'remotion'
import { Tutorial, FPS, INTRO_MS, OUTRO_MS } from './Tutorial.jsx'

// One composition for every tutorial: which one is a prop, and its length is
// read from the timeline the recorder wrote.
function Root() {
  return (
    <Composition
      id="Tutorial"
      component={Tutorial}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={FPS * 10}
      defaultProps={{ id: 'add-agent-to-lead-pool' }}
      calculateMetadata={async ({ props }) => {
        const timeline = await fetch(staticFile(`rec/${props.id}/timeline.json`)).then(r => r.json())
        return {
          durationInFrames: Math.ceil(((INTRO_MS + timeline.duration + OUTRO_MS) / 1000) * FPS),
          props: { ...props, timeline },
        }
      }}
    />
  )
}

registerRoot(Root)
