import type { Config } from './model'

type Part = { id: number; released: number; reworked: boolean }
type Job = { part: Part; remaining: number; done: number; passed: boolean }
type Machine = { alternate: boolean; failure: number; repair: number; failures: number; job?: Job; busyTime: number; upTime: number }
type Cell = { queue: Part[]; machines: Machine[]; enabled: boolean; blockedTime: number; starvedTime: number; lastTransfer: number }
export type State = 'Operating' | 'Blocked' | 'Starved' | 'Failed' | 'Idle'
export interface StationSnapshot {
  state: State
  queue: number
  inProcess: number
  utilization: number
  availability: number
  fault: string
  enabled: boolean
  progress: number
  blockedTime: number
  starvedTime: number
  alternateActive: number
  transferAge: number
}
export interface Sample { time: number; throughput: number; wip: number }
interface Output { time: number; lead: number; firstPass: boolean }

function random(seed: number, ...keys: number[]) {
  let hash = seed | 0
  for (const key of keys) {
    hash = Math.imul(hash ^ key, 0x45d9f3b)
    hash ^= hash >>> 16
  }
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d)
  return ((hash >>> 0) + 0.5) / 4294967296
}

export class Simulator {
  readonly cells: Cell[]
  readonly config: Config
  readonly output: Output[] = []
  readonly history: Sample[] = []
  time = 0
  released = 0
  scrap = 0
  rework = 0
  unmet = 0
  private nextRelease = 0
  private nextSample = 60

  constructor(config: Config) {
    this.config = structuredClone(config)
    if (!config.demand) this.nextRelease = Infinity
    this.cells = config.stations.map((station, index) => ({
      queue: [], enabled: true, blockedTime: 0, starvedTime: 0, lastTransfer: -Infinity,
      machines: Array.from({ length: station.machines + station.alternate }, (_, unit) => ({
        alternate: unit >= station.machines, failure: unit >= station.machines ? Infinity : this.failureInterval(index, unit, 0),
        repair: Infinity, failures: 0, busyTime: 0, upTime: 0,
      })),
    }))
  }

  private failureInterval(index: number, unit: number, count: number) {
    const rate = this.config.stations[index].failureRate
    return rate > 0 ? -Math.log(random(this.config.seed, 11, index, unit, count)) * 3600 / rate : Infinity
  }

  setEnabled(index: number, enabled: boolean) {
    const cell = this.cells[index]
    if (cell.enabled === enabled) return
    cell.enabled = enabled
    for (const [unit, machine] of cell.machines.entries()) {
      if (!machine.alternate && !enabled) {
        if (machine.job && !machine.job.passed && Number.isFinite(machine.job.done)) {
          machine.job.remaining = Math.max(0, machine.job.done - this.time)
          machine.job.done = Infinity
        }
        machine.failure = Infinity
      }
      if (!machine.alternate && enabled && machine.repair === Infinity) this.resume(index, unit, machine)
    }
    this.settle()
  }

  private resume(index: number, unit: number, machine: Machine) {
    machine.failure = this.time + this.failureInterval(index, unit, ++machine.failures)
    if (machine.job && !machine.job.passed) machine.job.done = this.time + machine.job.remaining
  }

  private available(cell: Cell, machine: Machine) {
    return (cell.enabled || machine.alternate) && machine.repair === Infinity
  }

  private state(index: number): State {
    const cell = this.cells[index]
    const available = cell.machines.filter(machine => this.available(cell, machine))
    if (!available.length) return 'Failed'
    if (available.some(machine => machine.job && !machine.job.passed)) return 'Operating'
    if (available.some(machine => machine.job?.passed)) return 'Blocked'
    return index === 0 ? 'Idle' : 'Starved'
  }

  private settle() {
    let changed: boolean
    do {
      changed = false
      for (let index = this.cells.length - 1; index >= 0; index--) {
        const cell = this.cells[index]
        const next = this.cells[index + 1]
        for (const machine of cell.machines) {
          if (!this.available(cell, machine)) continue
          if (machine.job?.passed) {
            if (!next) {
              const part = machine.job.part
              this.output.push({ time: this.time, lead: this.time - part.released, firstPass: !part.reworked })
            } else if (next.queue.length < this.config.stations[index + 1].buffer) {
              next.queue.push(machine.job.part)
              cell.lastTransfer = this.time
            } else continue
            machine.job = undefined
            changed = true
          }
          if (!machine.job && cell.queue.length && (!machine.alternate || !cell.enabled || cell.machines.some(unit => !unit.alternate && unit.repair !== Infinity))) {
            const part = cell.queue.shift()!
            const cycle = this.config.stations[index].cycle
            machine.job = { part, remaining: cycle, done: this.time + cycle, passed: false }
            if (machine.alternate && !Number.isFinite(machine.failure)) {
              machine.failure = this.time + this.failureInterval(index, cell.machines.indexOf(machine), machine.failures)
            }
            changed = true
          }
        }
      }
    } while (changed)
  }

  advance(target: number) {
    while (this.time < target) {
      let event = Math.min(target, this.nextRelease, this.nextSample)
      for (const cell of this.cells) for (const machine of cell.machines) {
        event = Math.min(event, machine.failure, machine.repair, machine.job?.done ?? Infinity)
      }
      const elapsed = event - this.time
      for (const [index, cell] of this.cells.entries()) {
        const state = this.state(index)
        if (state === 'Blocked') cell.blockedTime += elapsed
        if (state === 'Starved') cell.starvedTime += elapsed
        for (const machine of cell.machines) {
          if (this.available(cell, machine)) {
            machine.upTime += elapsed
            if (machine.job && !machine.job.passed) machine.busyTime += elapsed
          }
        }
      }
      this.time = event
      for (const [index, cell] of this.cells.entries()) {
        for (const [unit, machine] of cell.machines.entries()) {
          if (machine.job?.done === event) {
            const { part } = machine.job
            if (random(this.config.seed, 42, part.id, index, Number(part.reworked)) < this.config.stations[index].defect) {
              if ((index === 4 || index === 9) && !part.reworked) {
                part.reworked = true
                this.rework++
                const cycle = this.config.stations[index].cycle
                machine.job = { part, remaining: cycle, done: event + cycle, passed: false }
              } else {
                this.scrap++
                machine.job = undefined
              }
            } else {
              machine.job.passed = true
              machine.job.done = Infinity
            }
          }
          if (machine.repair === event) {
            machine.repair = Infinity
            if (cell.enabled || machine.alternate) this.resume(index, unit, machine)
          }
          if (machine.failure === event) {
            machine.repair = event + this.config.stations[index].repair
            machine.failure = Infinity
            if (machine.job && !machine.job.passed) {
              machine.job.remaining = machine.job.done - event
              machine.job.done = Infinity
            }
          }
        }
      }
      this.settle()
      if (this.nextRelease === event) {
        if (this.cells[0].queue.length < this.config.stations[0].buffer) {
          this.cells[0].queue.push({ id: ++this.released, released: event, reworked: false })
        } else this.unmet++
        this.nextRelease += this.config.demand ? 3600 / this.config.demand : Infinity
        this.settle()
      }
      if (this.nextSample === event) {
        const span = Math.min(event, 600)
        this.history.push({ time: event, throughput: this.rate(event - span, event), wip: this.wip })
        this.nextSample += 60
      }
    }
  }

  get wip() {
    return this.cells.reduce((total, cell) => total + cell.queue.length + cell.machines.filter(machine => machine.job).length, 0)
  }

  rate(start: number, end: number) {
    const countThrough = (time: number) => {
      let left = 0
      let right = this.output.length
      while (left < right) {
        const middle = Math.floor((left + right) / 2)
        if (this.output[middle].time <= time) left = middle + 1
        else right = middle
      }
      return left
    }
    return end > start ? (countThrough(end) - countThrough(start)) * 3600 / (end - start) : 0
  }

  snapshot() {
    const stationViews = this.cells.map((cell, index): StationSnapshot => {
      const active = cell.machines.find(machine => machine.job && !machine.job.passed && this.available(cell, machine))
      const held = cell.machines.find(machine => machine.job && !machine.job.passed)
      const elapsed = active?.job ? active.job.done - this.time : held?.job?.remaining
      const primary = cell.machines.filter(machine => !machine.alternate)
      const down = cell.machines.filter(machine => machine.repair !== Infinity).length
      const upTime = primary.reduce((total, machine) => total + machine.upTime, 0)
      const busyTime = cell.machines.reduce((total, machine) => total + machine.busyTime, 0)
      const availableTime = cell.machines.reduce((total, machine) => total + machine.upTime, 0)
      return {
        state: this.state(index), enabled: cell.enabled, queue: cell.queue.length,
        inProcess: cell.machines.filter(machine => machine.job).length,
        progress: elapsed === undefined ? 0 : 1 - elapsed / this.config.stations[index].cycle,
        utilization: availableTime ? busyTime / availableTime : 0,
        availability: this.time ? upTime / (this.time * primary.length) : Number(cell.enabled),
        fault: !cell.enabled ? 'Primary equipment offline' : down ? `${down} unit(s) under repair` : 'No active faults',
        blockedTime: cell.blockedTime, starvedTime: cell.starvedTime,
        alternateActive: cell.machines.filter(machine => machine.alternate && machine.job).length,
        transferAge: this.time - cell.lastTransfer,
      }
    })
    const capacity = this.cells.map((cell, index) => {
      const settings = this.config.stations[index]
      const units = cell.machines.filter(machine => this.available(cell, machine) &&
        (!machine.alternate || !cell.enabled || cell.machines.some(unit => !unit.alternate && unit.repair !== Infinity))).length
      const reworkFactor = index === 4 || index === 9 ? 1 + settings.defect : 1
      return units * 3600 / (settings.cycle * reworkFactor)
    })
    const limiting = Math.min(...capacity)
    const bottleneck = limiting < this.config.demand ? capacity.indexOf(limiting) : -1
    const completed = this.output.length
    return {
      time: this.time, completed, released: this.released, wip: this.wip, scrap: this.scrap, rework: this.rework,
      throughput: this.rate(0, this.time), recentThroughput: this.rate(Math.max(0, this.time - 600), this.time),
      lead: completed ? this.output.reduce((sum, part) => sum + part.lead, 0) / completed : 0,
      yield: completed + this.scrap ? this.output.filter(part => part.firstPass).length / (completed + this.scrap) : null,
      scrapRate: completed + this.scrap ? this.scrap / (completed + this.scrap) : null,
      bottleneck, capacity: limiting, stationViews, history: this.history.slice(), unmet: this.unmet,
    }
  }
}

export function compareFailures(config: Config) {
  const baseline = new Simulator(config)
  const failureTime = config.duration * 0.35
  const earlyEnd = failureTime + Math.min(600, config.duration * 0.2)
  const lateStart = config.duration * 0.75
  baseline.advance(config.duration)
  const baselineLate = baseline.rate(lateStart, config.duration)
  const cases = config.stations.map((_, index) => {
    const sim = new Simulator(config)
    sim.advance(failureTime)
    sim.setEnabled(index, false)
    sim.advance(config.duration)
    const result = sim.snapshot()
    const early = sim.rate(failureTime, earlyEnd)
    const late = sim.rate(lateStart, config.duration)
    return {
      index, early, late, loss: baselineLate - late, completed: result.completed, scrap: result.scrap,
      lead: result.lead, last: sim.output.at(-1)?.time ?? null, singlePoint: config.stations[index].alternate === 0,
    }
  }).sort((a, b) => b.loss - a.loss || a.early - b.early || a.index - b.index)
  return { baseline: baseline.snapshot(), baselineLast: baseline.output.at(-1)?.time ?? null, baselineEarly: baseline.rate(failureTime, earlyEnd), baselineLate, cases, failureTime, earlyEnd, lateStart }
}
