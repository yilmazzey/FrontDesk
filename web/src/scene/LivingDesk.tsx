import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { detailParts } from '../config'
import { useUI } from '../store'
import type { DeskBounds } from './useDesk'

/* ------------------------------------------------------------------ */
/* Coffee stain                                                        */
/* ------------------------------------------------------------------ */

function createStainTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2
  const cy = size / 2

  ctx.clearRect(0, 0, size, size)

  // main body of the spill — overlapping, slightly off-centre lobes
  ctx.save()
  ctx.translate(cx, cy)
  ctx.globalCompositeOperation = 'source-over'
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 34; i++) {
    const angle = rand() * Math.PI * 2
    const dist = rand() * 58
    const rx = 58 + rand() * 74
    const ry = rx * (0.62 + rand() * 0.42)
    ctx.beginPath()
    ctx.ellipse(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist * 0.82,
      rx,
      ry,
      angle,
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = `rgba(74, 42, 20, ${0.055 + rand() * 0.075})`
    ctx.fill()
  }

  // darker rim, like coffee drying at the edge
  const rim = ctx.createRadialGradient(0, 0, 100, 0, 0, 190)
  rim.addColorStop(0, 'rgba(56, 31, 13, 0)')
  rim.addColorStop(0.72, 'rgba(56, 31, 13, 0.06)')
  rim.addColorStop(0.92, 'rgba(48, 26, 10, 0.4)')
  rim.addColorStop(1, 'rgba(48, 26, 10, 0)')
  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.ellipse(0, 0, 192, 164, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // a couple of rings from the cup base
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.ellipse(-36 + i * 12, -28 + i * 9, 52 - i * 6, 46 - i * 6, -0.2, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(52, 28, 11, ${0.2 - i * 0.07})`
    ctx.lineWidth = 6 - i * 2
    ctx.stroke()
  }

  // splashes
  for (let i = 0; i < 16; i++) {
    const angle = rand() * Math.PI * 2
    const dist = 170 + rand() * 82
    const r = 3 + rand() * 12
    ctx.beginPath()
    ctx.ellipse(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist * 0.7,
      r,
      r * (0.7 + rand() * 0.7),
      angle,
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = `rgba(62, 35, 15, ${0.18 + rand() * 0.22})`
    ctx.fill()
  }
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/* ------------------------------------------------------------------ */
/* Living desk                                                         */
/* ------------------------------------------------------------------ */

type Props = {
  scene: THREE.Object3D
  bounds: DeskBounds
}

/**
 * Small physical behaviours that make the desk feel handled rather than
 * rendered: the mouse drifts with the pointer, the cup can spill, the pens
 * rattle when nudged.
 */
export function LivingDesk({ scene, bounds }: Props) {
  const { pointer, clock } = useThree()
  const setHover = useUI((s) => s.setHover)

  const [spilled, setSpilled] = useState(false)

  const stain = useMemo(() => createStainTexture(), [])
  const stainRef = useRef<THREE.Mesh>(null)
  const stainMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const spillValue = useRef(0)
  const pourStart = useRef(-10)
  const rattleStart = useRef(-10)
  const nudgeStart = useRef(-10)

  const objects = useMemo(() => {
    const cup = scene.getObjectByName(detailParts.cup)
    const mouse = scene.getObjectByName('Mouse')
    const pens = detailParts.pens
      .map((name) => scene.getObjectByName(name))
      .filter((object): object is THREE.Object3D => Boolean(object))

    return {
      cup,
      mouse,
      pens,
      cupBase: cup?.quaternion.clone() ?? new THREE.Quaternion(),
      mouseBase: mouse?.position.clone() ?? new THREE.Vector3(),
      mouseBaseYaw: mouse?.rotation.y ?? 0,
      penBase: pens.map((pen) => pen.quaternion.clone()),
    }
  }, [scene])

  const surfaceY = (bounds.desk?.max.y ?? 0.97) + 0.0016
  const cupCenter = bounds.cup?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3(-0.22, 0.98, 0.06)
  const stainPosition: [number, number, number] = [cupCenter.x + 0.115, surfaceY, cupCenter.z + 0.085]

  const hit = (box: THREE.Box3 | null, pad = 0.02) => {
    if (!box) return null
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    return {
      position: center.toArray() as [number, number, number],
      size: [size.x + pad * 2, size.y + pad * 2, size.z + pad * 2] as [number, number, number],
    }
  }

  const cupHit = hit(bounds.cup, 0.03)
  const stationeryHit = hit(bounds.stationery, 0.02)
  const mouseHit = hit(bounds.mouse, 0.03)

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const t = state.clock.elapsedTime

    // ---- mouse drift -------------------------------------------------
    if (objects.mouse) {
      const idleX = Math.sin(t * 0.7) * 0.0016
      const idleZ = Math.cos(t * 0.54) * 0.0012
      const nudge = Math.max(0, 1 - (t - nudgeStart.current) / 0.8)
      const kick = Math.sin((t - nudgeStart.current) * 24) * 0.012 * nudge
      const targetX = objects.mouseBase.x + pointer.x * 0.018 + idleX + kick
      const targetZ = objects.mouseBase.z - pointer.y * 0.012 + idleZ
      objects.mouse.position.x = THREE.MathUtils.damp(objects.mouse.position.x, targetX, 5, dt)
      objects.mouse.position.z = THREE.MathUtils.damp(objects.mouse.position.z, targetZ, 5, dt)
      objects.mouse.rotation.y = THREE.MathUtils.damp(
        objects.mouse.rotation.y,
        objects.mouseBaseYaw + pointer.x * 0.08,
        4,
        dt,
      )
    }

    // ---- pens rattle -------------------------------------------------
    const rattleAge = t - rattleStart.current
    objects.pens.forEach((pen, index) => {
      const damped = Math.max(0, 1 - rattleAge / 1.1)
      const wobble =
        Math.sin(rattleAge * 26 + index * 1.7) * 0.1 * damped * damped +
        Math.sin(t * 0.9 + index * 2.1) * 0.0035
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(wobble * 0.55, 0, wobble),
      )
      pen.quaternion.copy(objects.penBase[index]).multiply(q)
    })

    // ---- cup + spill -------------------------------------------------
    if (objects.cup) {
      const pourAge = t - pourStart.current
      const tipAmount = pourAge < 1.1 ? Math.sin((pourAge / 1.1) * Math.PI) * 0.22 : 0
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, tipAmount) as THREE.Euler,
      )
      objects.cup.quaternion.copy(objects.cupBase).multiply(q)
    }

    spillValue.current = THREE.MathUtils.damp(spillValue.current, spilled ? 1 : 0, 3.4, dt)
    if (stainRef.current) {
      stainRef.current.scale.setScalar(Math.max(spillValue.current, 0.0001))
    }
    if (stainMaterial.current) {
      stainMaterial.current.opacity = spillValue.current * 0.92
    }
  })

  const toggleSpill = () => {
    const next = !spilled
    if (next) pourStart.current = clock.elapsedTime
    setSpilled(next)
    setHover(null)
  }

  return (
    <group>
      {/* the puddle */}
      <mesh
        ref={stainRef}
        position={stainPosition}
        rotation={[-Math.PI / 2, 0, 0.22]}
        scale={0.0001}
        renderOrder={2}
      >
        <planeGeometry args={[0.46, 0.46]} />
        <meshBasicMaterial
          ref={stainMaterial}
          map={stain}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>

      {/* cup hit target */}
      {cupHit && (
        <mesh
          position={cupHit.position}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHover('cup')
          }}
          onPointerOut={() => setHover(null)}
          onClick={(event) => {
            event.stopPropagation()
            toggleSpill()
          }}
        >
          <boxGeometry args={cupHit.size} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
        </mesh>
      )}

      {/* stationery hit target */}
      {stationeryHit && (
        <mesh
          position={stationeryHit.position}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHover('stationery')
          }}
          onPointerOut={() => setHover(null)}
          onClick={(event) => {
            event.stopPropagation()
            rattleStart.current = clock.elapsedTime
            setHover(null)
          }}
        >
          <boxGeometry args={stationeryHit.size} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
        </mesh>
      )}

      {/* mouse hit target */}
      {mouseHit && (
        <mesh
          position={mouseHit.position}
          onPointerOver={(event) => {
            event.stopPropagation()
            setHover('mouse')
          }}
          onPointerOut={() => setHover(null)}
          onClick={(event) => {
            event.stopPropagation()
            nudgeStart.current = clock.elapsedTime
            setHover(null)
          }}
        >
          <boxGeometry args={mouseHit.size} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
