import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const release = {
  url: 'https://github.com/danielATiriai/iriai-proto/releases/download/v0.1.0/iriai-proto-0.1.0.tar.gz',
  sha256: '24d10f1a572539918962dadf18262ff124d72f18fa79fa465dea697aa5da7310',
}

const response = await fetch(release.url)
if (!response.ok) throw new Error(`Downloading ${release.url} answered ${response.status}`)
const bundle = Buffer.from(await response.arrayBuffer())
const sha256 = createHash('sha256').update(bundle).digest('hex')
if (sha256 !== release.sha256) throw new Error(`Bundle SHA-256 is ${sha256}, expected ${release.sha256}`)

writeFileSync('iriai-proto-0.1.0.tar.gz', bundle)
execFileSync('tar', ['-xzf', 'iriai-proto-0.1.0.tar.gz', 'lexicons', 'lexicons.json'], { stdio: 'inherit' })
console.log(`✓ contracts v0.1.0 unpacked, SHA-256 ${sha256}`)
