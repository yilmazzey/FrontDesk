#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const write = (path, value) => writeFileSync(join(root, path), value)

const args = process.argv.slice(2)
const check = args.includes('--check')
const tag = args.find((arg) => arg.startsWith('v'))

const rootPackage = JSON.parse(read('package.json'))
const version = rootPackage.version
if (tag && tag !== `v${version}`) {
  console.error(`Release tag ${tag} does not match package.json version ${version}.`)
  process.exit(1)
}

const mismatches = []
const same = (label, actual) => {
  if (actual !== version) mismatches.push(`${label}: ${actual} (expected ${version})`)
}

function syncJson(path, label) {
  const raw = read(path)
  const json = JSON.parse(raw)
  same(label, json.version)
  if (!check && json.version !== version) {
    json.version = version
    write(path, `${JSON.stringify(json, null, 2)}\n`)
  }
}

function syncCargoToml() {
  const path = 'desktop/src-tauri/Cargo.toml'
  const raw = read(path)
  const marker = raw.indexOf('[dependencies]')
  const head = marker === -1 ? raw : raw.slice(0, marker)
  const match = head.match(/^version = "([^"]+)"/m)
  if (!match) throw new Error('Could not find the Cargo package version.')
  same('Cargo.toml', match[1])
  if (!check && match[1] !== version) {
    const start = match.index
    const next = raw.slice(start).replace(/^version = "[^"]+"/m, `version = "${version}"`)
    write(path, raw.slice(0, start) + next)
  }
}

function syncCargoLock() {
  const path = 'desktop/src-tauri/Cargo.lock'
  const raw = read(path)
  const match = raw.match(/\[\[package\]\]\nname = "frontdesk-desktop"\nversion = "([^"]+)"/)
  if (!match) return
  same('Cargo.lock', match[1])
  if (!check && match[1] !== version) {
    write(path, raw.replace(match[0], match[0].replace(match[1], version)))
  }
}

syncJson('web/package.json', 'web/package.json')
syncJson('desktop/package.json', 'desktop/package.json')
syncJson('desktop/src-tauri/tauri.conf.json', 'tauri.conf.json')
syncCargoToml()
syncCargoLock()

if (check && mismatches.length) {
  console.error('Version mismatch:\n' + mismatches.join('\n'))
  console.error('Run `npm run version:sync` and commit the result.')
  process.exit(1)
}
console.log(check ? `Versions match v${version}.` : `Synced versions to v${version}.`)
