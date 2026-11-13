import * as THREE from 'three'

export type PartMap = Record<string, THREE.Object3D>

/** Index every named object in the loaded scene so hit areas can find their parts. */
export function collectParts(root: THREE.Object3D): PartMap {
  const map: PartMap = {}
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (object.name) map[object.name] = object
  })
  return map
}

/** Union world-space bounding box for a set of mesh/group names. */
export function boundsOf(parts: PartMap, names: readonly string[]): THREE.Box3 | null {
  const box = new THREE.Box3()
  let found = false

  for (const name of names) {
    const object = parts[name]
    if (!object) continue
    box.expandByObject(object)
    found = true
  }

  return found && !box.isEmpty() ? box : null
}
