import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useUI } from '../store'
import { useDesk } from './useDesk'
import { CameraRig } from './CameraRig'
import { LampLight } from './LampLight'
import { ScreenSurface } from './ScreenSurface'
import { LivingDesk } from './LivingDesk'

type Props = {
  onOpenApp: () => void
}

function Ready() {
  const setReady = useUI((s) => s.setReady)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(() => {
        invalidate()
        setReady(true)
      })
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [invalidate, setReady])

  return null
}

/**
 * An invisible click target laid over a part of the desk. The objects are
 * meant to be used, not labelled — the cursor is the only affordance.
 */
function HitBox({
  id,
  box,
  grow = 0.16,
  onActivate,
}: {
  id: string
  box: THREE.Box3 | null
  grow?: number
  onActivate: () => void
}) {
  const setHover = useUI((s) => s.setHover)

  const hit = useMemo(() => {
    if (!box) return null
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const pad = Math.max(size.x, size.z) * grow + 0.02
    return {
      position: center.toArray() as [number, number, number],
      size: [size.x + pad, size.y + pad * 1.6, size.z + pad] as [number, number, number],
    }
  }, [box, grow])

  if (!hit) return null

  return (
    <mesh
      position={hit.position}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHover(id)
      }}
      onPointerOut={() => setHover(null)}
      onClick={(event) => {
        event.stopPropagation()
        setHover(null)
        onActivate()
      }}
    >
      <boxGeometry args={hit.size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  )
}

function Desk() {
  const { scene, bounds } = useDesk()
  const toggleLamp = useUI((s) => s.toggleLamp)
  const openNotebook = useUI((s) => s.openNotebook)
  const enterApp = useUI((s) => s.enterApp)

  return (
    <group>
      <primitive object={scene} />

      {bounds.lamp && <LampLight bounds={bounds} scene={scene} />}
      <ScreenSurface onOpen={() => enterApp()} />
      <LivingDesk scene={scene} bounds={bounds} />

      <HitBox id="lamp" box={bounds.lamp} onActivate={toggleLamp} />
      <HitBox id="notebook" box={bounds.notebook} grow={0.1} onActivate={openNotebook} />
    </group>
  )
}

export function DeskScene({ onOpenApp }: Props) {
  const hover = useUI((s) => s.hover)
  const theme = useUI((s) => s.theme)
  const light = theme === 'light'

  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hover])

  return (
    <Canvas
      shadows
      frameloop="always"
      // Measure the untransformed box so a transient CSS transform on an
      // ancestor cannot make the canvas resize mid-scroll.
      resize={{ offsetSize: true }}
      dpr={[1, 1.5]}
      camera={{ position: [1.62, 1.66, 2.42], fov: 34, near: 0.04, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = light ? 0.96 : 1.04
      }}
      onPointerMissed={() => useUI.getState().setHover(null)}
    >
      <color attach="background" args={[light ? '#e2d6c2' : '#12100e']} />
      <fog attach="fog" args={[light ? '#e2d6c2' : '#12100e', light ? 6.5 : 5.5, 14]} />

      <ambientLight intensity={light ? 0.58 : 0.34} />
      <hemisphereLight
        args={light ? ['#fff8ec', '#bfae94', 0.78] : ['#cfd9e4', '#241a12', 0.55]}
      />

      <directionalLight
        position={[2.9, 3.6, 2.6]}
        intensity={light ? 2.15 : 1.9}
        color={light ? '#fff6e8' : '#fff2df'}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />
      <directionalLight
        position={[-2.8, 2.4, 0.9]}
        intensity={light ? 0.55 : 0.5}
        color={light ? '#cfe0f2' : '#9fb9d6'}
      />
      <directionalLight
        position={[-1.4, 1.6, -2.8]}
        intensity={light ? 0.5 : 0.85}
        color={light ? '#ffd7a8' : '#ffb066'}
      />

      <Environment resolution={64} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.6}
          position={[0, 3.4, 2.2]}
          scale={[6, 3, 1]}
          color="#fff4e4"
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          position={[-3.2, 2.2, 1.2]}
          rotation-y={Math.PI / 3}
          scale={[3, 4, 1]}
          color="#a9c6e6"
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          position={[3.4, 1.6, -1.4]}
          rotation-y={-Math.PI / 3}
          scale={[3, 3, 1]}
          color="#ffc38a"
        />
        <Lightformer form="ring" intensity={0.5} position={[0, 1.2, -3]} scale={3} color="#5c6f82" />
      </Environment>

      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.004} receiveShadow>
        <circleGeometry args={[14, 64]} />
        <meshStandardMaterial
          color={light ? '#d2c2a8' : '#171310'}
          roughness={light ? 0.98 : 0.94}
          metalness={0}
        />
      </mesh>

      <ContactShadows
        position={[0, 0.002, 0.06]}
        scale={6.5}
        blur={2.6}
        opacity={light ? 0.32 : 0.62}
        far={2.2}
        resolution={512}
        color={light ? '#5a4630' : '#000000'}
        frames={1}
      />

      <Suspense fallback={null}>
        <Desk />
        <Ready />
      </Suspense>

      <CameraRig />
      <OpenAppOnEnter onOpenApp={onOpenApp} />
    </Canvas>
  )
}

/** Navigates to /app after the camera pushes toward the monitor. */
function OpenAppOnEnter({ onOpenApp }: { onOpenApp: () => void }) {
  const mode = useUI((s) => s.mode)

  useEffect(() => {
    if (mode !== 'entering') return
    const timer = window.setTimeout(onOpenApp, 620)
    return () => window.clearTimeout(timer)
  }, [mode, onOpenApp])

  return null
}
