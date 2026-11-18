#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
let failed = false
const rows = []

function check(label, ok, detail, required = false) {
  rows.push({ label, ok, detail })
  if (!ok && required) failed = true
}

function command(name, args = ['--version']) {
  const result = spawnSync(name, args, { encoding: 'utf8' })
  return result.status === 0 ? (result.stdout || result.stderr).trim().split('\n')[0] : null
}

const nodeMajor = Number(process.versions.node.split('.')[0])
check('Node.js', nodeMajor >= 20, `v${process.versions.node}`, true)
check('npm', Boolean(process.env.npm_execpath), process.env.npm_execpath ? 'available' : 'not running through npm')
check('package-lock.json', existsSync(join(root, 'package-lock.json')), existsSync(join(root, 'package-lock.json')) ? 'found' : 'missing — run npm install')
check('Cargo', Boolean(command('cargo')), command('cargo') ?? 'missing — install Rust', true)
check('Rust compiler', Boolean(command('rustc')), command('rustc') ?? 'missing — install Rust', true)
check('rustfmt', Boolean(command('cargo', ['fmt', '--version'])), 'available')

if (process.platform === 'darwin') {
  check('Xcode command line tools', Boolean(command('xcode-select', ['-p'])), command('xcode-select', ['-p']) ?? 'run xcode-select --install')
}
if (process.platform === 'linux') {
  const packages = ['webkit2gtk-4.1', 'librsvg-2.0', 'appindicator3-0.1']
  for (const pkg of packages) {
    check(`pkg-config ${pkg}`, Boolean(command('pkg-config', ['--exists', pkg])), command('pkg-config', ['--exists', pkg]) ? 'found' : 'install the Tauri Linux dependencies')
  }
}

const envLocal = join(root, 'desktop/.env.local')
const envProd = join(root, 'desktop/.env.production')
let clientId = null
for (const path of [envLocal, envProd]) {
  if (!existsSync(path)) continue
  const match = readFileSync(path, 'utf8').match(/VITE_MICROSOFT_CLIENT_ID\s*=\s*"?([^"\n]+)"?/)
  if (match?.[1] && !match[1].includes('your')) {
    clientId = match[1].trim()
    break
  }
}
check('Microsoft client ID', Boolean(clientId), clientId ? 'configured' : 'optional — set it in Settings or desktop/.env.local')

const modelsDir = join(root, 'models')
const models = existsSync(modelsDir)
  ? readdirSync(modelsDir).filter((name) => name.toLowerCase().endsWith('.gguf'))
  : []
check('Local GGUF model', models.length > 0, models.length ? `${models.length} file(s)` : 'optional — Extractive mode needs no model')

for (const row of rows) {
  const icon = row.ok ? '✓' : '•'
  console.log(`${icon} ${row.label.padEnd(28)} ${row.detail ?? ''}`)
}
console.log('\nDoctor finished. "•" items are optional unless marked required.')
process.exit(failed ? 1 : 0)
