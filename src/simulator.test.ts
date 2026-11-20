import { describe, expect, it } from 'vitest'
import { configuration } from './model'
import { compareFailures, Simulator } from './simulator'

function controlled() {
  const config = configuration('Balanced Factory')
  for (const cell of config.stations) {
    cell.failureRate = 0
    cell.defect = 0
  }
  return config
}

describe('production simulator', () => {
  it('replays deterministically regardless of advance cadence', () => {
    const config = configuration('Balanced Factory')
    const batch = new Simulator(config)
    const stepped = new Simulator(config)
    batch.advance(14400)
    for (let time = 3; time <= 14400; time += 3) stepped.advance(time)
    expect(stepped.output).toEqual(batch.output)
    expect(stepped.history).toEqual(batch.history)
    expect(stepped.scrap).toBe(batch.scrap)
  })

  it('conserves parts and respects buffer and machine limits during a failure', () => {
    const config = configuration('Bottleneck Factory')
    const sim = new Simulator(config)
    for (let time = 60; time <= 9000; time += 60) {
      if (time === 1800) sim.setEnabled(8, false)
      if (time === 4200) sim.setEnabled(8, true)
      sim.advance(time)
      const result = sim.snapshot()
      expect(result.released).toBe(result.wip + result.completed + result.scrap)
      result.stationViews.forEach((station, index) => {
        expect(station.queue).toBeLessThanOrEqual(config.stations[index].buffer)
        expect(station.inProcess).toBeLessThanOrEqual(config.stations[index].machines)
      })
    }
    expect(sim.unmet).toBeGreaterThan(0)
  })

  it('accounts for interrupted jobs and stops after downstream WIP drains', () => {
    const sim = new Simulator(controlled())
    sim.advance(2501)
    const held = sim.snapshot().stationViews[0].inProcess
    sim.setEnabled(0, false)
    sim.advance(5000)
    expect(sim.snapshot().stationViews[0].inProcess).toBe(held)
    expect(sim.snapshot().stationViews[11].state).toBe('Starved')
    const complete = sim.output.length
    sim.advance(7000)
    expect(sim.output).toHaveLength(complete)
    sim.setEnabled(0, true)
    sim.advance(9000)
    expect(sim.output.length).toBeGreaterThan(complete)
  })

  it('repairs failed equipment and resumes the remaining job time', () => {
    const sim = new Simulator(controlled())
    sim.advance(10)
    sim.cells[0].machines[0].failure = 11
    sim.advance(12)
    expect(sim.snapshot().stationViews[0].state).toBe('Failed')
    sim.advance(131)
    expect(sim.snapshot().stationViews[0].state).toBe('Operating')
    sim.advance(150)
    expect(sim.cells[1].machines[0].job).toBeUndefined()
    sim.advance(151)
    expect(sim.cells[1].machines[0].job?.part.id).toBe(1)
  })

  it('requires the full first-pass cycle including timed parallel curing', () => {
    const config = controlled()
    const first = config.stations.reduce((sum, cell) => sum + cell.cycle, 0)
    const sim = new Simulator(config)
    sim.advance(first - 1)
    expect(sim.output).toHaveLength(0)
    sim.advance(first)
    expect(sim.output).toHaveLength(1)
    expect(sim.rate(first - 100, first)).toBe(36)
    expect(sim.rate(first, first)).toBe(0)
    expect(sim.snapshot().lead).toBe(first)
    expect(sim.snapshot().yield).toBe(1)
  })

  it('identifies the live constraint and respects zero production demand', () => {
    const config = controlled()
    config.stations[9].cycle = 200
    const sim = new Simulator(config)
    sim.advance(3000)
    expect(sim.snapshot().bottleneck).toBe(9)
    sim.setEnabled(4, false)
    expect(sim.snapshot().bottleneck).toBe(4)
    config.demand = 0
    const idle = new Simulator(config)
    idle.advance(3000)
    expect(idle.released).toBe(0)
  })

  it('compares equivalent experiments and exposes buffer masking', () => {
    const result = compareFailures(controlled())
    expect(result.cases).toHaveLength(12)
    expect(result.baselineLate).toBeGreaterThan(0)
    expect(result.cases.every(entry => entry.late === 0 && entry.singlePoint)).toBe(true)
    expect(result.cases.find(entry => entry.index === 0)?.early).toBeGreaterThan(0)
  })

  it('uses only explicitly eligible alternate capacity', () => {
    const config = configuration('Resilient Factory')
    const sim = new Simulator(config)
    sim.advance(3000)
    expect(sim.snapshot().stationViews[9].alternateActive).toBe(0)
    sim.setEnabled(9, false)
    sim.advance(9000)
    expect(sim.rate(7000, 9000)).toBeGreaterThan(0)
    expect(sim.cells[9].machines.filter(unit => unit.alternate && unit.job)).toHaveLength(1)
    sim.setEnabled(8, false)
    sim.advance(14000)
    expect(sim.rate(12000, 14000)).toBe(0)
  })

  it('demonstrates different production behavior in each preset', () => {
    const runs = (['Balanced Factory', 'Bottleneck Factory', 'Resilient Factory'] as const).map(preset => {
      const config = configuration(preset)
      const sim = new Simulator(config)
      sim.advance(config.duration)
      return sim.snapshot().completed
    })
    expect(runs[1]).toBeLessThan(runs[0])
    expect(runs[2]).toBeGreaterThan(runs[0])
  })
})
