import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { framing } from '../config'
import { useUI } from '../store'
import { easeInOut, scrollStage } from '../lib/scroll'

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const toVector = (value: readonly [number, number, number]) => new THREE.Vector3(...value)

/**
 * Framing is authored in config.ts. This rig eases between poses, adds a
 * little pointer parallax and pulls back on narrow screens.
 *
 * While the page is being scrolled it blends the resting desk pose into the
 * `handoff` pose, frame by frame. That is what makes the hand-off read as a
 * camera move: the desk parallaxes and the lens opens up as the paper rises,
 * instead of the whole canvas being scaled by CSS.
 */
export function CameraRig() {
  const mode = useUI((s) => s.mode)
  const { camera, size, pointer } = useThree()

  const lookAt = useRef(toVector(framing.desk.target))
  const desired = useRef(toVector(framing.desk.position))
  const goal = useRef(toVector(framing.desk.position))
  const target = useRef(toVector(framing.desk.target))
  const fov = useRef(framing.desk.fov)
  const started = useRef(false)

  const deskFrom = useRef(toVector(framing.desk.position))
  const deskTo = useRef(toVector(framing.desk.target))
  const handoffFrom = useRef(toVector(framing.handoff.position))
  const handoffTo = useRef(toVector(framing.handoff.target))

  // Reusable scratch vectors — the scroll branch runs every frame.
  const fromPos = useRef(new THREE.Vector3())
  const fromTarget = useRef(new THREE.Vector3())
  const toPos = useRef(new THREE.Vector3())
  const toTarget = useRef(new THREE.Vector3())
  const blended = useRef(new THREE.Vector3())
  const blendedTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    if (started.current) return
    started.current = true
    camera.position.set(
      framing.desk.position[0] * 1.14,
      framing.desk.position[1] + 0.16,
      framing.desk.position[2] * 1.14,
    )
  }, [camera])

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    const pose =
      mode === 'notebook' ? framing.notebook : mode === 'entering' ? framing.screen : framing.desk

    const aspect = size.width / size.height
    const portrait = aspect < 1
    const pullback = portrait ? 1.3 : 1
    const fovBoost = portrait ? 13 : 0

    const t = state.clock.elapsedTime
    const driftX = reduceMotion || mode !== 'desk' ? 0 : Math.sin(t * 0.28) * 0.018
    const driftY = reduceMotion || mode !== 'desk' ? 0 : Math.cos(t * 0.22) * 0.012
    const px = mode === 'desk' ? pointer.x * 0.09 : 0
    const py = mode === 'desk' ? pointer.y * 0.05 : 0

    // Scroll-linked dolly. Perfectly mapped to the scroll position, so it
    // never lags behind the finger / wheel.
    const progress = mode === 'desk' ? easeInOut(scrollStage.progress) : 0
    if (progress > 0.0001) {
      // Build the resting pose exactly the way the normal branch does, so the
      // first pixel of scroll does not pop between portrait framing and this.
      fromTarget.current.copy(deskTo.current)
      if (portrait) fromTarget.current.y -= 0.24
      fromPos.current
        .copy(deskFrom.current)
        .sub(fromTarget.current)
        .multiplyScalar(pullback)
        .add(fromTarget.current)
      fromPos.current.y += (pullback - 1) * 0.18

      toTarget.current.copy(handoffTo.current)
      if (portrait) toTarget.current.y -= 0.24
      toPos.current
        .copy(handoffFrom.current)
        .sub(toTarget.current)
        .multiplyScalar(pullback)
        .add(toTarget.current)
      toPos.current.y += (pullback - 1) * 0.18

      blended.current.copy(fromPos.current).lerp(toPos.current, progress)
      blendedTarget.current.copy(fromTarget.current).lerp(toTarget.current, progress)

      // Fade the idle drift and pointer parallax out as the dolly starts.
      const idle = 1 - progress
      blended.current.x += (driftX + px) * idle
      blended.current.y += (driftY + py) * idle

      camera.position.copy(blended.current)
      camera.lookAt(blendedTarget.current)

      const nextFov = THREE.MathUtils.lerp(
        framing.desk.fov + fovBoost,
        framing.handoff.fov + fovBoost,
        progress,
      )
      if (Math.abs((camera as THREE.PerspectiveCamera).fov - nextFov) > 0.001) {
        ;(camera as THREE.PerspectiveCamera).fov = nextFov
        camera.updateProjectionMatrix()
      }

      // Keep the eased refs in sync so scrolling back up hands over cleanly.
      desired.current.copy(blended.current)
      lookAt.current.copy(blendedTarget.current)
      target.current.copy(blendedTarget.current)
      fov.current = nextFov
      return
    }

    target.current.set(...pose.target)
    if (portrait && mode === 'desk') target.current.y -= 0.24
    goal.current.set(...pose.position)
    goal.current.sub(target.current).multiplyScalar(pullback).add(target.current)
    goal.current.x += driftX + px
    goal.current.y += driftY + py
    goal.current.y += (pullback - 1) * 0.18

    const lambda = mode === 'desk' ? 3.2 : 3.6

    desired.current.x = THREE.MathUtils.damp(desired.current.x, goal.current.x, lambda, dt)
    desired.current.y = THREE.MathUtils.damp(desired.current.y, goal.current.y, lambda, dt)
    desired.current.z = THREE.MathUtils.damp(desired.current.z, goal.current.z, lambda, dt)
    camera.position.copy(desired.current)

    lookAt.current.x = THREE.MathUtils.damp(lookAt.current.x, target.current.x, lambda, dt)
    lookAt.current.y = THREE.MathUtils.damp(lookAt.current.y, target.current.y, lambda, dt)
    lookAt.current.z = THREE.MathUtils.damp(lookAt.current.z, target.current.z, lambda, dt)
    camera.lookAt(lookAt.current)

    const goalFov = pose.fov + fovBoost
    fov.current = THREE.MathUtils.damp(fov.current, goalFov, lambda, dt)
    if (Math.abs((camera as THREE.PerspectiveCamera).fov - fov.current) > 0.01) {
      ;(camera as THREE.PerspectiveCamera).fov = fov.current
      camera.updateProjectionMatrix()
    }
  })

  return null
}
