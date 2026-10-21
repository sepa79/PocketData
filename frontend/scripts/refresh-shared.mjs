import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) throw new Error('Usage: npm run refresh:shared -- /path/to/PocketHive')
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = resolve(frontend, 'vendor')
const manifestPath = resolve(frontend, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const packages = ['ui', 'browser-auth'].map(directory => {
  const path = resolve(source, 'packages', directory)
  const metadata = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'))
  if (metadata.name !== `@pockethive/${directory}`) throw new Error(`Unexpected package at ${path}`)
  return { path, metadata }
})
mkdirSync(vendor, { recursive: true })
for (const { path, metadata } of packages) {
  const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', vendor], { cwd: path, encoding: 'utf8' }))
  if (result.length !== 1 || result[0].name !== metadata.name) throw new Error('Unexpected npm pack result')
  const packed = result[0].filename
  const digest = createHash('sha256').update(readFileSync(resolve(vendor, packed))).digest('hex').slice(0, 12)
  const artifact = packed.replace(/\.tgz$/, `-${digest}.tgz`)
  renameSync(resolve(vendor, packed), resolve(vendor, artifact))
  manifest.dependencies[metadata.name] = `file:vendor/${artifact}`
  process.stdout.write(`${metadata.name}@${metadata.version}: ${artifact}\n`)
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write('Run npm install to refresh the integrity-pinned lockfile, then npm test && npm run build.\n')
