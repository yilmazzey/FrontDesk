#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const source = process.env.SOURCE_GLB || 'assets/computer_desk.glb'
if (!existsSync(source)) {
  console.error(`Source model not found: ${source}`)
  console.error('The raw 50 MB GLB is intentionally not tracked. Place it locally or set SOURCE_GLB.')
  process.exit(1)
}

const result = spawnSync(
  'npx',
  [
    'gltf-transform',
    'optimize',
    source,
    'public/desk.glb',
    '--texture-compress',
    'webp',
    '--texture-size',
    '1024',
    '--compress',
    'false',
  ],
  { stdio: 'inherit' },
)
process.exit(result.status ?? 1)
