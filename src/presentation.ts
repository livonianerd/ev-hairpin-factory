import type { State } from './simulator'

export const stationId = (index: number) => String(index + 1).padStart(2, '0')

export const lights: Record<State, string> = {
  Operating: '#32c98e',
  Failed: '#f35f58',
  Starved: '#e4b24f',
  Blocked: '#e4b24f',
  Idle: '#6aaafb',
}
