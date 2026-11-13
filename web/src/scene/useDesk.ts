import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { parts as partNames } from '../config'
import { boundsOf, collectParts, type PartMap } from '../lib/geometry'

export type DeskBounds = Record<keyof typeof partNames, THREE.Box3 | null>

const MODEL_URL = '/desk.glb'

/**
 * Loads the desk once and prepares it:
 *  - removes the chair (it only ever blocked the shot)
 *  - shadows + anisotropic filtering
 *  - a private material clone for the bulb so it can glow
 */
export function useDesk() {
  const { scene } = useGLTF(MODEL_URL)

  const parts = useMemo(() => collectParts(scene), [scene])

  const bounds = useMemo<DeskBounds>(
    () => ({
      desk: boundsOf(parts, partNames.desk),
      lamp: boundsOf(parts, partNames.lamp),
      monitor: boundsOf(parts, partNames.monitor),
      notebook: boundsOf(parts, partNames.notebook),
      cup: boundsOf(parts, partNames.cup),
      mouse: boundsOf(parts, partNames.mouse),
      stationery: boundsOf(parts, partNames.stationery),
    }),
    [parts],
  )

  useEffect(() => {
    const maxAnisotropy = 4

    // Drop the chair from the graph entirely — hiding it still costs a draw
    // call, and it never sat anywhere that didn't cover the desk.
    scene.getObjectByName('Chair')?.removeFromParent()

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return

      object.castShadow = true
      object.receiveShadow = true

      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        const map = (material as THREE.MeshStandardMaterial).map
        if (map) map.anisotropy = maxAnisotropy
      }
    })

    // The bulb gets its own material so the glow can be animated safely.
    const bulb = scene.getObjectByName('DeskLamp_Alpha_0') as THREE.Mesh | undefined
    if (bulb && !Array.isArray(bulb.material)) {
      const material = bulb.material.clone() as THREE.MeshStandardMaterial
      material.emissive = new THREE.Color('#ffb257')
      material.emissiveIntensity = 0
      material.toneMapped = true
      bulb.material = material
    }
  }, [scene])

  return { scene, parts: parts as PartMap, bounds }
}

useGLTF.preload(MODEL_URL)

export { MODEL_URL }
