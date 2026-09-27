// ============================================================================
// THE NARRATOR: each caption spoken, generated on this machine
// ============================================================================
// Kokoro (Apache-2.0), run locally through kokoro-js: no account, no key, no
// per-video cost. The model (~90 MB) downloads once on first use.
//
// A line is generated once and kept in .voice-cache by its text and voice, so
// re-recording a tutorial whose words did not change costs nothing here.
// ============================================================================
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CACHE = path.join(HERE, '.voice-cache')
export const VOICE = process.env.TUTORIAL_VOICE || 'af_heart'

let tts = null
async function engine() {
  if (!tts) {
    const { KokoroTTS } = await import('kokoro-js')
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })
  }
  return tts
}

// A WAV's length, read from its header: bytes of samples over bytes a second.
function wavMs(file) {
  const b = fs.readFileSync(file)
  const byteRate = b.readUInt32LE(28)
  let i = 12
  while (i < b.length - 8) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4)
    if (id === 'data') return Math.round((size / byteRate) * 1000)
    i += 8 + size
  }
  return 0
}

/** Speak `text` into `outFile`. Returns its length in ms. */
export async function speak(text, outFile) {
  fs.mkdirSync(CACHE, { recursive: true })
  const key = crypto.createHash('sha1').update(`${VOICE}|${text}`).digest('hex').slice(0, 16)
  const cached = path.join(CACHE, `${key}.wav`)
  if (!fs.existsSync(cached)) {
    const audio = await (await engine()).generate(text, { voice: VOICE })
    await audio.save(cached)
  }
  fs.copyFileSync(cached, outFile)
  return wavMs(outFile)
}
