export const stations = [
  { name: 'Wire feeding', equipment: 'Powered payoff & servo straightener', detail: 'Unwinds insulated rectangular copper stock and straightens it under controlled tension.', cycle: 31, defect: 0 },
  { name: 'Cutting', equipment: 'Servo feed & flying shear', detail: 'Indexes the wire and shears blanks to the required conductor lengths.', cycle: 35, defect: 0 },
  { name: 'Hairpin forming', equipment: 'CNC bending press', detail: 'Forms rectangular blanks into U-profile conductors using a die and two bending tools.', cycle: 46, defect: 0 },
  { name: 'Insulation stripping', equipment: 'Enclosed optical stripping cell', detail: 'Removes enamel from the terminal ends before joining.', cycle: 39, defect: 0 },
  { name: 'Geometry inspection', equipment: 'Machine vision & metrology gantry', detail: 'Screens bend geometry, dimensions and insulation. A failed kit may receive one correction and reinspection.', cycle: 32, defect: 0.035 },
  { name: 'Stator preparation', equipment: 'Core loader & slot liner fixture', detail: 'Loads a laminated core, aligns the slots and stages slot insulation for conductor insertion.', cycle: 36, defect: 0 },
  { name: 'Hairpin insertion', equipment: 'Robot-assisted insertion press', detail: 'Aligns a conductor kit with the lined slots and seats the legs with a vertical press.', cycle: 53, defect: 0.008 },
  { name: 'End-turn forming', equipment: 'Segmented annular forming die', detail: 'Aligns protruding ends to establish clearances before twisting.', cycle: 36, defect: 0 },
  { name: 'Twisting', equipment: 'Counter-rotating twist rings', detail: 'Indexes the winding layers in opposing directions to bring conceptual joining pairs into position.', cycle: 44, defect: 0 },
  { name: 'Laser welding', equipment: 'Interlocked laser cell & rotary indexer', detail: 'Indexes exposed ends past a weld head. Joining is represented geometrically for this conceptual model.', cycle: 49, defect: 0.022 },
  { name: 'Insulation and impregnation', equipment: 'Resin dosing & 12-position cure rack', detail: 'Represents connection insulation and resin dosing, followed by a timed cure. Each occupied position counts against capacity.', cycle: 540, defect: 0.008 },
  { name: 'Electrical testing', equipment: 'Interlocked electrical test fixture', detail: 'Represents resistance, insulation, continuity and surge screening with a probabilistic pass/fail decision.', cycle: 37, defect: 0.025 },
] as const

export interface StatorGeometry {
  slots: number
  layers: number
}
export const referenceStator: StatorGeometry = { slots: 48, layers: 4 }
// Electrical design intent only. The simulation contains no connection map.
export const electricalReference = { poles: 8, phases: 3 } as const

export interface StationConfig {
  cycle: number
  buffer: number
  machines: number
  failureRate: number
  repair: number
  defect: number
  alternate: number
}
export interface Config {
  stations: StationConfig[]
  demand: number
  duration: number
  seed: number
}
export type Preset = 'Balanced Factory' | 'Bottleneck Factory' | 'Resilient Factory'
export const presets: Preset[] = ['Balanced Factory', 'Bottleneck Factory', 'Resilient Factory']

export function configuration(preset: Preset): Config {
  const config: Config = {
    demand: 80, duration: 14400, seed: 4818,
    stations: stations.map((station, index) => ({
      cycle: station.cycle, buffer: 4, machines: index === 10 ? 12 : 1,
      failureRate: index === 10 ? 0.08 : 0.18, repair: 120, defect: station.defect, alternate: 0,
    })),
  }
  if (preset === 'Bottleneck Factory') config.stations[9].cycle = 105
  if (preset === 'Resilient Factory') {
    for (const index of [6, 9, 10]) {
      config.stations[index].machines += 1
      config.stations[index].alternate = index === 10 ? 12 : 1
    }
  }
  return config
}
