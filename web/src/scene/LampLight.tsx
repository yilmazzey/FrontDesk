import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useUI } from '../store'
import type { DeskBounds } from './useDesk'

/**
 * The desk lamp: a warm spot aimed at the notebook, a glowing bulb and a soft
 * halo. Everything ramps with damping so it feels like a physical switch.
 */
export function LampLight({ bounds, scene }: { bounds: DeskBounds; scene: THREE.Object3D }) {
  const lampOn = useUI((s) => s.lampOn)
  const spot = useRef<THREE.SpotLight>(null)
  const target = useRef<THREE.Object3D>(null)
  const halo = useRef<THREE.Sprite>(null)
  const point = useRef<THREE.PointLight>(null)

  const bulbMaterial = useMemo(() => {
    const bulb = scene.getObjectByName('DeskLamp_Alpha_0') as THREE.Mesh | undefined
    return (bulb?.material as THREE.MeshStandardMaterial | undefined) ?? null
  }, [scene])

  const haloTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255, 208, 140, 1)')
    gradient.addColorStop(0.28, 'rgba(255, 176, 92, 0.55)')
    gradient.addColorStop(0.62, 'rgba(255, 156, 64, 0.13)')
    gradient.addColorStop(1, 'rgba(255, 150, 60, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])

  const anchor = useMemo(() => {
    const box = bounds.lamp
    if (!box) return new THREE.Vector3(0, 1.2, 0)
    const center = box.getCenter(new THREE.Vector3())
    return new THREE.Vector3(center.x, box.max.y - 0.16, center.z)
  }, [bounds])

  useEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current
  }, [])

  useFrame((_, dt) => {
    if (spot.current) {
      spot.current.intensity = THREE.MathUtils.damp(spot.current.intensity, lampOn ? 9 : 0, 4.5, dt)
    }
    if (point.current) {
      point.current.intensity = THREE.MathUtils.damp(point.current.intensity, lampOn ? 0.55 : 0, 4.5, dt)
    }
    if (halo.current) {
      const material = halo.current.material as THREE.SpriteMaterial
      material.opacity = THREE.MathUtils.damp(material.opacity, lampOn ? 0.95 : 0, 5, dt)
      const scale = 0.3 + (lampOn ? 0.06 : 0)
      halo.current.scale.setScalar(THREE.MathUtils.damp(halo.current.scale.x, scale, 5, dt))
    }
    if (bulbMaterial) {
      bulbMaterial.emissiveIntensity = THREE.MathUtils.damp(
        bulbMaterial.emissiveIntensity,
        lampOn ? 2.6 : 0,
        5,
        dt,
      )
    }
  })

  return (
    <group>
      <spotLight
        ref={spot}
        position={[anchor.x, anchor.y - 0.02, anchor.z]}
        angle={0.92}
        penumbra={0.92}
        intensity={0}
        distance={2.6}
        decay={2}
        color="#ffbe7a"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
      />
      <object3D ref={target} position={[-0.36, 0.99, 0.06]} />

      <pointLight
        ref={point}
        position={[anchor.x, anchor.y - 0.05, anchor.z]}
        color="#ffb066"
        intensity={0}
        distance={0.9}
        decay={2}
      />

      <sprite ref={halo} position={[anchor.x, anchor.y + 0.01, anchor.z]} scale={0.3}>
        <spriteMaterial
          map={haloTexture}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}
