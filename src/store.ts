import { create } from 'zustand'
import { configuration, type Config, type Preset } from './model'
import { Simulator } from './simulator'

export const speeds = [1, 5, 20, 100] as const
type Speed = typeof speeds[number]

interface FactoryStore {
  sim: Simulator
  reference: Simulator
  data: ReturnType<Simulator['snapshot']>
  loss: number
  speed: Speed
  running: boolean
  preset: Preset
  version: number
  tick: (seconds: number) => void
  setSpeed: (speed: Speed) => void
  toggleRun: () => void
  setEnabled: (index: number, enabled: boolean) => void
  restart: (config?: Config, preset?: Preset) => void
}

const start = new Simulator(configuration('Balanced Factory'))
start.advance(1500)
const baseline = new Simulator(start.config)
baseline.advance(start.time)

export const useFactory = create<FactoryStore>((set, get) => ({
  sim: start, reference: baseline, data: start.snapshot(), loss: 0, speed: 5, running: true, preset: 'Balanced Factory', version: 0,
  tick: (seconds) => {
    const { running, sim, reference, speed } = get()
    if (!running) return
    const target = Math.min(sim.config.duration, sim.time + seconds * speed)
    sim.advance(target)
    reference.advance(target)
    const data = sim.snapshot()
    const nominal = reference.rate(Math.max(0, target - 600), target)
    set({ data, loss: Math.max(0, nominal - data.recentThroughput), running: target < sim.config.duration })
  },
  setSpeed: speed => set({ speed }),
  toggleRun: () => {
    const { sim, running } = get()
    if (!running && sim.time >= sim.config.duration) get().restart()
    set({ running: !running })
  },
  setEnabled: (index, enabled) => {
    const { sim } = get()
    sim.setEnabled(index, enabled)
    set({ data: sim.snapshot() })
  },
  restart: (config, preset) => {
    const current = get()
    const sim = new Simulator(config ?? current.sim.config)
    set({ sim, reference: new Simulator(sim.config), data: sim.snapshot(), loss: 0, preset: preset ?? current.preset, running: false, version: current.version + 1 })
  },
}))
