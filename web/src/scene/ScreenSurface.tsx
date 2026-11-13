import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { createScreenTexture } from './screenTexture'
import { screenPlane } from '../config'
import { useUI } from '../store'

type Props = {
  onOpen: () => void
}

/** A soft diagonal reflection so the screen reads as glass, not a poster. */
function createGlareTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 320
  const ctx = canvas.getContext('2d')!

  const sweep = ctx.createLinearGradient(0, 0, 430, 320)
  sweep.addColorStop(0, 'rgba(255,244,226,0.5)')
  sweep.addColorStop(0.34, 'rgba(255,236,208,0.14)')
  sweep.addColorStop(0.62, 'rgba(255,255,255,0)')
  sweep.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sweep
  ctx.fillRect(0, 0, 512, 320)

  const pool = ctx.createRadialGradient(398, 54, 4, 398, 54, 130)
  pool.addColorStop(0, 'rgba(255,231,196,0.3)')
  pool.addColorStop(1, 'rgba(255,231,196,0)')
  ctx.fillStyle = pool
  ctx.fillRect(0, 0, 512, 320)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * The UI plane is laid exactly on the monitor's front panel using the
 * quaternion measured from the model, so it reads as real glass.
 */
export function ScreenSurface({ onOpen }: Props) {
  const texture = useMemo(() => createScreenTexture(), [])
  const glare = useMemo(() => createGlareTexture(), [])
  const [hovered, setHovered] = useState(false)
  const setHover = useUI((s) => s.setHover)
  const glow = useRef<THREE.PointLight>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)

  const { position, rotation, normal, size } = useMemo(() => {
    const q = new THREE.Quaternion(...screenPlane.quaternion)
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    const p = new THREE.Vector3(...screenPlane.position).addScaledVector(n, screenPlane.offset)
    return {
      position: p,
      rotation: q,
      normal: n,
      size: [
        screenPlane.size[0] * screenPlane.inset[0],
        screenPlane.size[1] * screenPlane.inset[1],
      ] as [number, number],
    }
  }, [])

  useFrame((_, dt) => {
    if (glow.current) {
      glow.current.intensity = THREE.MathUtils.damp(glow.current.intensity, hovered ? 0.85 : 0.3, 4, dt)
    }
    if (mat.current) {
      const target = hovered ? 1.16 : 1
      mat.current.color.setScalar(THREE.MathUtils.damp(mat.current.color.r, target, 6, dt))
    }
  })

  return (
    <group>
      <mesh
        position={position}
        quaternion={rotation}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          setHover('monitor')
        }}
        onPointerOut={() => {
          setHovered(false)
          setHover(null)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
      >
        <planeGeometry args={size} />
        <meshBasicMaterial ref={mat} map={texture} toneMapped={false} />
      </mesh>

      {/* glass reflection, no raycasting so clicks pass through */}
      <mesh
        position={position.clone().addScaledVector(normal, 0.0011)}
        quaternion={rotation}
        raycast={() => null}
      >
        <planeGeometry args={size} />
        <meshBasicMaterial
          map={glare}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <pointLight
        ref={glow}
        position={position.clone().addScaledVector(normal, 0.34)}
        color="#8fd8ff"
        intensity={0.3}
        distance={1.5}
        decay={2}
      />
    </group>
  )
}
