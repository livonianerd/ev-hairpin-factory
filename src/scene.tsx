import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Component, createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, Object3D, Vector3, type InstancedMesh } from 'three'
import type { OrbitControls as Orbit } from 'three-stdlib'
import { referenceStator, stations, type StatorGeometry } from './model'
import type { StationSnapshot } from './simulator'
import { lights, stationId } from './presentation'

type Vec = [number, number, number]
const steel = '#53646a'
const dark = '#202d32'
const orange = '#e7a444'
const copper = '#db7634'
const cream = '#b7bec0'
const teal = '#46796f'
const positions: Vec[] = stations.map((_, i) => {
  const row = Math.floor(i / 4)
  const column = i % 4
  return [((row % 2 ? 3 - column : column) - 1.5) * 5.65, 0, (row - 1) * 5.1]
})

function Box({ p, s, c = dark, r = 0, glow = 0, opacity = 1 }: { p: Vec; s: Vec; c?: string; r?: number; glow?: number; opacity?: number }) {
  return <mesh position={p} rotation-y={r} castShadow={opacity === 1} receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={0.65} metalness={0.18} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} emissive={c} emissiveIntensity={glow} />
  </mesh>
}

function Cylinder({ p, radius, height, c, side = false, segments = 40 }: { p: Vec; radius: number; height: number; c: string; side?: boolean; segments?: number }) {
  return <mesh position={p} rotation-z={side ? Math.PI / 2 : 0} castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, height, segments]} />
    <meshStandardMaterial color={c} metalness={0.54} roughness={0.43} />
  </mesh>
}

function Batch({ matrices, color }: { matrices: Matrix4[]; color: string }) {
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    matrices.forEach((matrix, i) => mesh.current?.setMatrixAt(i, matrix))
    if (mesh.current) {
      mesh.current.instanceMatrix.needsUpdate = true
      mesh.current.computeBoundingSphere()
    }
  }, [matrices])
  return <instancedMesh ref={mesh} args={[undefined, undefined, matrices.length]} castShadow receiveShadow>
    <boxGeometry /><meshStandardMaterial color={color} metalness={0.48} roughness={0.42} />
  </instancedMesh>
}

function statorMatrices({ slots, layers }: StatorGeometry) {
  const teeth: Matrix4[] = [], legs: Matrix4[] = [], crowns: Matrix4[] = []
  const object = new Object3D()
  const step = 2 * Math.PI / slots
  const wireWidth = Math.min(0.043, 0.18 / layers, step * 0.31)
  function store(result: Matrix4[], p: Vec, s: Vec, angle: number) {
    object.position.set(...p)
    object.scale.set(...s)
    object.rotation.set(0, angle, 0)
    object.updateMatrix()
    result.push(object.matrix.clone())
  }
  for (let slot = 0; slot < slots; slot++) {
    const a = slot * step
    store(teeth, [Math.sin(a) * 0.83, 0.03, Math.cos(a) * 0.83], [step * 0.42, 0.57, 0.34], a)
    for (let layer = 0; layer < layers; layer++) {
      const r = 0.725 + layer * (0.174 / (layers - 1))
      const angle = a + step / 2
      store(legs, [Math.sin(angle) * r, 0.12, Math.cos(angle) * r], [wireWidth, 0.86, wireWidth], angle)
      if (slot % 2 === 0) {
        const mid = angle + step / 2
        store(crowns, [Math.sin(mid) * r, 0.55, Math.cos(mid) * r], [r * step + wireWidth * 0.8, 0.07, wireWidth], mid)
      }
    }
  }
  return { teeth, legs, crowns }
}

const StatorShape = createContext(statorMatrices(referenceStator))

function Stator({ p, filled, lift = 0, twist = 0 }: { p: Vec; filled: boolean; lift?: number; twist?: number }) {
  const shape = useContext(StatorShape)
  return <group position={p}>
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} position-y={-0.24 + i * 0.078} rotation-x={Math.PI / 2} castShadow receiveShadow>
      <ringGeometry args={[0.95, 1.13, 64]} /><meshStandardMaterial color={i % 2 ? '#818789' : '#48565a'} side={2} metalness={0.55} roughness={0.49} />
    </mesh>)}
    <mesh position-y={0.035} castShadow receiveShadow><cylinderGeometry args={[1.125, 1.125, 0.54, 64, 1, true]} /><meshStandardMaterial color="#576367" metalness={0.56} roughness={0.43} side={2} /></mesh>
    <Batch matrices={shape.teeth} color="#87949a" />
    {filled && <group position-y={lift}>
      <Batch matrices={shape.legs} color="#b85e2e" />
      <group rotation-y={twist}><Batch matrices={shape.crowns} color="#f29852" /></group>
    </group>}
  </group>
}

function Hairpin({ p, amount = 1, stripped = false }: { p: Vec; amount?: number; stripped?: boolean }) {
  return <group position={p}>
    <Box p={[0, 0, 0]} s={[0.64, 0.095, 0.09]} c={copper} />
    {[-1, 1].map(sign => <group key={sign} position-x={sign * 0.29} rotation-y={sign * ((1 - amount) * Math.PI / 2)}>
      <Box p={[0, 0, 0.34]} s={[0.09, 0.095, 0.75]} c={copper} />
      {stripped && <Box p={[0, 0, 0.73]} s={[0.091, 0.095, 0.17]} c="#ffc684" />}
    </group>)}
  </group>
}

function Conveyor({ a, b, transferAge }: { a: Vec; b: Vec; transferAge: number }) {
  const length = Math.hypot(b[0] - a[0], b[2] - a[2])
  return <group position={[(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]} rotation-y={-Math.atan2(b[2] - a[2], b[0] - a[0])}>
    <Box p={[0, 0.39, 0]} s={[length, 0.19, 0.89]} c="#303a3e" />
    {[-0.46, 0.46].map(z => <Box key={z} p={[0, 0.54, z]} s={[length, 0.12, 0.05]} c="#86949b" />)}
    {Array.from({ length: 13 }, (_, i) => <Box key={i} p={[(i - 6) * length / 13, 0.51, 0]} s={[0.09, 0.06, 0.83]} c="#65757b" />)}
    {[-1, 1].map(x => <Box key={x} p={[x * length * 0.19, 0.22, 0]} s={[0.12, 0.44, 0.79]} c={steel} />)}
    {transferAge < 6 && <group position-x={(transferAge / 6 - 0.5) * length}>
      <Box p={[0, 0.59, 0]} s={[0.54, 0.09, 0.64]} c={steel} />
      <Box p={[0, 0.68, 0]} s={[0.38, 0.13, 0.49]} c={copper} />
    </group>}
  </group>
}

function Tool({ y, z = 0, color = orange }: { y: number; z?: number; color?: string }) {
  return <group position={[0, y, z]}><Box p={[0, 0.21, 0]} s={[0.48, 0.57, 0.48]} c={color} /><Cylinder p={[0, -0.1, 0]} radius={0.125} height={0.29} c={cream} /></group>
}

function Gantry({ color = cream, glass = false }: { color?: string; glass?: boolean }) {
  return <group>
    {[-1.17, 1.17].map(x => <group key={x}><Box p={[x, 1.5, -0.15]} s={[0.19, 1.95, 1.57]} c={color} />
      {glass && <Box p={[x * 0.94, 1.66, 0.56]} s={[0.045, 1.48, 0.37]} c="#6bcba7" opacity={0.38} />}
    </group>)}
    <Box p={[0, 2.46, -0.15]} s={[2.55, 0.23, 1.62]} c={color} />
    <Box p={[0, 2.34, 0.19]} s={[2.2, 0.04, 0.065]} c="#a7ffd0" glow={0.7} />
    <Box p={[0, 1.5, -0.87]} s={[2.2, 1.7, 0.095]} c={glass ? '#294944' : dark} />
  </group>
}

function Robot({ progress }: { progress: number }) {
  return <group position={[1.36, 0.66, -0.64]} rotation-y={-0.5 + progress * 0.65}>
    <Cylinder p={[0, 0.13, 0]} radius={0.34} height={0.26} c={dark} />
    <group position-y={0.3} rotation-z={0.26 + progress * 0.36}>
      <Box p={[0, 0.45, 0]} s={[0.29, 1, 0.35]} c={orange} />
      <Cylinder p={[0, 0.85, 0]} radius={0.22} height={0.41} c="#b77930" side />
      <group position-y={0.86} rotation-z={1.12 - progress * 0.48}>
        <Box p={[0, 0.39, 0]} s={[0.23, 0.89, 0.29]} c={orange} />
        <Box p={[0, 0.88, 0]} s={[0.34, 0.2, 0.27]} c={dark} />
      </group>
    </group>
  </group>
}

function Machine({ index, progress, active, occupancy }: { index: number; progress: number; active: boolean; occupancy: number }) {
  const stroke = active ? Math.sin(progress * Math.PI) : 0
  switch (index) {
    case 0: return <group>
      <Box p={[0.54, 1.14, 0]} s={[0.95, 1, 1.29]} c={teal} />
      <group position={[-0.68, 1.36, 0]} rotation-x={progress * Math.PI * 4}>
        <Cylinder p={[0, 0, 0]} radius={0.67} height={0.76} c={copper} side />
        {[-0.43, 0.43].map(x => <Cylinder key={x} p={[x, 0, 0]} radius={0.81} height={0.1} c={x < 0 ? steel : orange} side />)}
        <Box p={[0.488, 0, 0]} s={[0.04, 1.15, 0.09]} c={dark} />
      </group>
      <Box p={[0.7 + progress * 0.36, 1.31, 0.67]} s={[1.38, 0.05, 0.065]} c={copper} />
    </group>
    case 1: return <group><Gantry color={teal} /><Tool y={2.05 - stroke * 0.83} />
      <Box p={[-0.35 + progress * 0.45, 0.78, 0.3]} s={[1.32, 0.05, 0.13]} c={copper} />
      <Box p={[0.78 + Math.max(0, progress - 0.5), 0.78, 0.3]} s={[0.46, 0.05, 0.13]} c={copper} />
    </group>
    case 2: return <group><Gantry /><Tool y={2.01 - stroke * 0.58} /><Hairpin p={[0, 0.81, 0.08]} amount={active ? progress : 1} />
      {[-1, 1].map(sign => <Box key={sign} p={[sign * (0.78 - stroke * 0.29), 1.01, 0.27]} s={[0.27, 0.36, 0.56]} c={orange} />)}
    </group>
    case 3: return <group><Gantry color={teal} glass /><Hairpin p={[0, 0.81, 0.04]} stripped={progress > 0.48} />
      <Tool y={1.66 - stroke * 0.23} z={0.66} color={cream} />
      {active && <Box p={[0, 0.86, 0.79]} s={[0.73 * stroke, 0.04, 0.08]} c="#ff7731" glow={3} />}
    </group>
    case 4: return <group><Gantry color={cream} glass /><Hairpin p={[0, 0.81, 0.04]} stripped />
      <group position-x={progress * 1.37 - 0.65}><Tool y={1.73} z={0.45} color={teal} />
        {active && <Box p={[0, 1.16, 0.45]} s={[0.03, 0.74, 0.52]} c="#64eaa7" glow={1.9} opacity={0.43} />}
      </group>
    </group>
    case 5: return <group><Robot progress={stroke} /><Stator p={[-0.48, 1, 0.26]} filled={false} /><Box p={[-1.48, 0.85, -0.38]} s={[0.53, 0.42, 0.86]} c={teal} /></group>
    case 6: return <group><Gantry color={cream} /><Tool y={2.14 - stroke * 0.44} /><Stator p={[0, 0.99, 0.22]} filled lift={active ? (1 - progress) * 0.58 : 0} /></group>
    case 7: return <group><Gantry color={teal} /><Stator p={[0, 0.97, 0.23]} filled />
      <Cylinder p={[0, 2.05 - stroke * 0.38, 0.23]} radius={0.88} height={0.22} c={steel} />
      <Cylinder p={[0, 2.29 - stroke * 0.38, 0.23]} radius={0.36} height={0.34} c={orange} />
    </group>
    case 8: return <group>
      <Gantry color={cream} />
      <Stator p={[0, 0.97, 0]} filled twist={progress * 0.13} />
      <group position-y={1.73 - stroke * 0.17}>
        <group rotation-y={progress * Math.PI * 0.8}>
          <mesh rotation-x={Math.PI / 2}><torusGeometry args={[0.93, 0.075, 12, 48]} /><meshStandardMaterial color={orange} metalness={0.45} /></mesh>
          <Box p={[0, 0, 0.92]} s={[0.23, 0.16, 0.17]} c={cream} />
        </group>
        <group rotation-y={-progress * Math.PI * 0.8}>
          <mesh rotation-x={Math.PI / 2}><torusGeometry args={[0.65, 0.065, 12, 40]} /><meshStandardMaterial color={steel} metalness={0.5} /></mesh>
          <Box p={[0, 0, 0.64]} s={[0.19, 0.14, 0.14]} c={orange} />
        </group>
      </group>
    </group>
    case 9: return <group><Gantry color={teal} glass /><group rotation-y={progress * Math.PI * 2}><Stator p={[0, 0.98, 0]} filled /></group>
      <group position-x={Math.sin(progress * 12) * 0.55}><Tool y={2.02} z={0.31} />
        {active && <Box p={[0, 1.64, 0.31]} s={[0.023, 0.46, 0.023]} c="#ff811f" glow={4} />}
      </group>
    </group>
    case 10: return <group>
      <Box p={[0, 1.44, -0.42]} s={[2.75, 1.88, 1.34]} c={teal} />
      {[0, 1, 2, 3].map(row => <group key={row}>
        <Box p={[0, 0.92 + row * 0.4, 0.34]} s={[2.52, 0.32, 0.27]} c={dark} />
        {[0, 1, 2].map(column => <Box key={column} p={[(column - 1) * 0.81, 0.92 + row * 0.4, 0.5]} s={[0.59, 0.12, 0.06]} c={row * 3 + column < occupancy ? orange : steel} glow={row * 3 + column < occupancy ? 0.6 : 0} />)}
      </group>)}
    </group>
    default: return <group><Gantry color={cream} glass /><Stator p={[0, 0.97, 0.22]} filled /><Tool y={2.08 - stroke * 0.34} z={0.25} color={teal} />
      <Box p={[1.35, 1.83, 0.52]} s={[0.42, 0.43, 0.09]} c={active ? '#71efae' : '#366654'} glow={active ? 1.15 : 0.2} />
    </group>
  }
}

function Station({ index, data, selected, select }: { index: number; data: StationSnapshot; selected: boolean; select: () => void }) {
  return <group position={positions[index]} onClick={event => { event.stopPropagation(); select() }}>
    <Box p={[0, 0.025, 0]} s={[4.66, 0.045, 3.19]} c={selected ? '#6a5338' : '#34413f'} />
    {[-1.53, 1.53].map(z => <Box key={z} p={[0, 0.06, z]} s={[4.58, 0.026, 0.038]} c={selected ? '#efaa52' : '#687569'} />)}
    <Box p={[0, 0.37, 0]} s={[3.28, 0.63, 1.94]} c={steel} />
    <Box p={[0, 0.69, 0]} s={[3.38, 0.12, 2]} c={dark} />
    <Box p={[0.87, 0.41, 0.98]} s={[0.77, 0.3, 0.035]} c="#a3afad" />
    <Box p={[-0.69, 0.34, 1]} s={[0.77, 0.2, 0.04]} c={dark} />
    <Machine index={index} active={data.state === 'Operating'} progress={data.progress} occupancy={data.inProcess} />
    <Cylinder p={[1.58, 1.14, -0.54]} radius={0.037} height={0.9} c={steel} />
    <Box p={[1.58, 1.65, -0.54]} s={[0.16, 0.19, 0.16]} c={lights[data.state]} glow={1.65} />
    {Array.from({ length: Math.min(data.queue, 5) }, (_, i) => <Box key={i} p={[-1.6 - (i % 2) * 0.23, 0.63 + Math.floor(i / 2) * 0.08, 0.72]} s={[0.19, 0.07, 0.38]} c={copper} />)}
    <Html position={[0, 2.86, 0]} center zIndexRange={[12, 1]}>
      <button className={'scene-marker' + (selected ? ' selected' : '')} title={stations[index].name} aria-label={`Focus ${stations[index].name}`} onClick={select}><i style={{ background: lights[data.state] }} />{stationId(index)}</button>
    </Html>
  </group>
}

function FactoryFloor({ snapshots }: { snapshots: StationSnapshot[] }) {
  const markings = useMemo(() => {
    const object = new Object3D()
    return Array.from({ length: 88 }, (_, i) => {
      object.position.set(-11.8 + (i % 22) * 1.1, 0.014, [-7.1, -2.55, 2.55, 7.1][Math.floor(i / 22)])
      object.scale.set(0.52, 0.016, 0.04)
      object.updateMatrix()
      return object.matrix.clone()
    })
  }, [])
  return <>
    <Box p={[0, -0.19, 0]} s={[25.7, 0.36, 16.5]} c="#35423e" />
    <gridHelper args={[26, 26, '#53645d', '#46544f']} position={[0, -0.008, 0]} scale-z={0.632} />
    <Batch matrices={markings} color="#a58a4f" />
    {[-12.45, 12.45].map(x => <group key={x}>
      <Box p={[x, 0.31, 0]} s={[0.07, 0.085, 15.7]} c="#bc944e" />
      {[-7.7, -3.9, 0, 3.9, 7.7].map(z => <Box key={z} p={[x, 0.28, z]} s={[0.11, 0.57, 0.11]} c={orange} />)}
    </group>)}
    {positions.slice(0, -1).map((p, i) => <Conveyor key={i} a={p} b={positions[i + 1]} transferAge={snapshots[i].transferAge} />)}
  </>
}

const overview = new Vector3(18, 17, 22)

function Camera({ focus, part, tour, onSelect }: { focus: { index: number; token: number } | null; part: boolean; tour: boolean; onSelect: (index: number) => void }) {
  const controls = useRef<Orbit>(null)
  const goal = useRef({ position: overview, target: new Vector3(), active: false })
  const tourIndex = useRef(0)
  const tourTime = useRef(0)
  useLayoutEffect(() => {
    const target = part ? new Vector3(0, 0.14, 0) : focus ? new Vector3(...positions[focus.index]).add(new Vector3(0, 0.8, 0)) : new Vector3()
    const position = part ? new Vector3(3.2, 2.9, 4.1) : focus ? target.clone().add(new Vector3(4.4, 4.8, 5.3)) : overview
    goal.current = { position, target, active: true }
  }, [focus, part])
  useLayoutEffect(() => { tourIndex.current = 0; tourTime.current = 6 }, [tour])
  useFrame(({ camera }, delta) => {
    if (tour && !part) {
      tourTime.current += delta
      if (tourTime.current >= 6) {
        tourTime.current = 0
        onSelect(tourIndex.current)
        tourIndex.current = (tourIndex.current + 1) % stations.length
      }
    }
    const orbit = controls.current
    if (!orbit || !goal.current.active) return
    const smoothing = 1 - Math.exp(-5 * delta)
    camera.position.lerp(goal.current.position, smoothing)
    orbit.target.lerp(goal.current.target, smoothing)
    orbit.update()
    if (camera.position.distanceTo(goal.current.position) < 0.02) goal.current.active = false
  })
  return <OrbitControls ref={controls} makeDefault enableDamping minDistance={2} maxDistance={65} maxPolarAngle={Math.PI * 0.48} onStart={() => { goal.current.active = false }} />
}

class GraphicsBoundary extends Component<{ children: ReactNode }, { unavailable: boolean }> {
  state = { unavailable: false }
  static getDerivedStateFromError() { return { unavailable: true } }
  render() { return this.state.unavailable ? <p className="scene-fallback">WebGL is unavailable. The simulation and station controls are still active.</p> : this.props.children }
}

export function FactoryScene({ snapshots, selected, select, focus, part, tour, visible, geometry }: {
  snapshots: StationSnapshot[]; selected: number; select: (index: number) => void;
  focus: { index: number; token: number } | null; part: boolean; tour: boolean; visible: boolean; geometry: StatorGeometry;
}) {
  const shape = useMemo(() => statorMatrices(geometry), [geometry])
  if (!visible) return <p className="scene-fallback">3D rendering off · simulation remains active</p>
  return <GraphicsBoundary><Canvas camera={{ position: overview.toArray(), fov: 42 }} dpr={[1, 1.5]} shadows fallback={<p className="scene-fallback">WebGL is unavailable on this browser.</p>}>
    <color attach="background" args={['#17201f']} />
    <fog attach="fog" args={['#17201f', 38, 78]} />
    <ambientLight intensity={0.92} color="#c5dbd6" />
    <hemisphereLight args={['#e2f1e7', '#575344', 1.3]} />
    <directionalLight position={[-7, 17, 8]} intensity={2.7} color="#fff1d5" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-19} shadow-camera-right={19} shadow-camera-top={15} shadow-camera-bottom={-15} shadow-normalBias={0.035} />
    <directionalLight position={[8, 7, -11]} intensity={1.5} color="#a8e0d7" />
    <Camera focus={focus} part={part} tour={tour} onSelect={select} />
    <StatorShape.Provider value={shape}>
      {part ? <group><Cylinder p={[0, -0.39, 0]} radius={1.38} height={0.23} c={dark} /><Stator p={[0, 0, 0]} filled /></group> :
        <><FactoryFloor snapshots={snapshots} />{snapshots.map((data, index) => <Station key={index} index={index} data={data} selected={selected === index} select={() => select(index)} />)}</>}
    </StatorShape.Provider>
  </Canvas></GraphicsBoundary>
}
