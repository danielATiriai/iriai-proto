import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Lexicons, type LexiconDoc } from '@atproto/lexicon'

/** Package root: dist/src/contracts.js lives two levels below it. */
export const packageRoot = new URL('../../', import.meta.url).pathname

export interface ProtoConfig {
  namespace: string
  publisher: { handle: string; did: string; authorityRecord: string }
  communityEventCollection: string
}

/** Read from iriai-proto.config.json; the namespace is never hard-coded (D-30). */
export const config: ProtoConfig = JSON.parse(
  readFileSync(join(packageRoot, 'iriai-proto.config.json'), 'utf8'),
)

/** NSID of the PlaceProto event sidecar record, e.g. app.iriai.proto.event. */
export const eventSidecarNsid = `${config.namespace}.event`
/** NSID of the shared definitions, e.g. app.iriai.proto.defs. */
export const defsNsid = `${config.namespace}.defs`

function readLexiconDir(dir: string): LexiconDoc[] {
  const docs: LexiconDoc[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) docs.push(...readLexiconDir(path))
    else if (entry.name.endsWith('.json')) docs.push(JSON.parse(readFileSync(path, 'utf8')))
  }
  return docs
}

/** Every lexicon in this release: ours plus the vendored community schemas. */
export const lexicons = new Lexicons(readLexiconDir(join(packageRoot, 'lexicons')))
