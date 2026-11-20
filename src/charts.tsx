import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { stations } from './model'
import { stationId } from './presentation'
import type { compareFailures, Sample, StationSnapshot } from './simulator'

const green = '#347766'
const amber = '#cb7948'
const axes = { fontSize: 11, fill: '#626b63' }
const tip = { border: '1px solid #dedfd6', borderRadius: 8, color: '#222a23' }

export function Trends({ history, views }: { history: Sample[]; views: StationSnapshot[] }) {
  return <div className="chart-grid">
    <section className="chart"><h3>Throughput over time</h3><p>Trailing stators/hour · sampled every simulated minute</p>
      <div className="plot">{history.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={history}>
        <CartesianGrid stroke="#e8e9e2" vertical={false} />
        <XAxis dataKey="time" tickFormatter={value => `${value / 60}m`} tick={axes} />
        <YAxis tick={axes} width={33} />
        <Tooltip contentStyle={tip} labelFormatter={value => `${Number(value) / 60} simulated min`} formatter={value => Number(value).toFixed(1)} />
        <Line type="linear" dataKey="throughput" name="Stators/hour" stroke={green} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart></ResponsiveContainer> : <div className="empty-chart">Samples appear after the first simulated minute.</div>}</div>
    </section>
    <section className="chart"><h3>Station utilization</h3><p>Processing time as a share of available machine time</p>
      <div className="plot"><ResponsiveContainer width="100%" height="100%"><BarChart data={views.map((view, i) => ({ station: stationId(i), utilization: Math.round(view.utilization * 100) }))}>
        <CartesianGrid stroke="#e8e9e2" vertical={false} />
        <XAxis dataKey="station" tick={axes} interval={0} />
        <YAxis tick={axes} domain={[0, 100]} tickFormatter={value => `${value}%`} width={39} />
        <Tooltip contentStyle={tip} labelFormatter={value => stations[Number(value) - 1]?.name} formatter={value => `${value}%`} />
        <Bar dataKey="utilization" name="Utilization" fill={green} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart></ResponsiveContainer></div>
    </section>
  </div>
}

export function FailureResults({ result }: { result: ReturnType<typeof compareFailures> }) {
  const f = (n: number) => n.toFixed(1)
  const minutes = (n: number) => `${f(n / 60)}m`
  const base = result.baseline
  return <div className="failure-results">
    <p>Failures start at {minutes(result.failureTime)}. The immediate window ends at {minutes(result.earlyEnd)}. The late-run window starts at {minutes(result.lateStart)} and estimates sustained output over the configured horizon. A long cure or queue can carry downstream work into either window.</p>
    <div className="plot"><ResponsiveContainer width="100%" height="100%"><BarChart data={result.cases.map(row => ({ ...row, station: stationId(row.index) }))}>
      <CartesianGrid stroke="#e8e9e2" vertical={false} />
      <XAxis dataKey="station" tick={axes} interval={0} /><YAxis tick={axes} width={37} />
      <Tooltip contentStyle={tip} labelFormatter={value => stations[Number(value) - 1]?.name} formatter={value => f(Number(value))} />
      <Legend iconType="circle" />
      <ReferenceLine y={result.baselineLate} stroke={green} strokeDasharray="4 4" />
      <Bar dataKey="early" name="Immediate stators/h" fill={amber} isAnimationActive={false} />
      <Bar dataKey="late" name="Late-run stators/h" fill={green} isAnimationActive={false} />
    </BarChart></ResponsiveContainer></div>
    <div className="table-scroll"><table>
      <caption>Ranked by late-run production loss</caption>
      <thead><tr>{['Disabled station', 'Immediate /h', 'Late-run /h', 'Loss /h', 'Completed', 'Scrap', 'Avg. lead', 'Last completion', 'Single point'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>
        <tr className="baseline"><th scope="row">Baseline</th><td>{f(result.baselineEarly)}</td><td>{f(result.baselineLate)}</td><td>—</td><td>{base.completed}</td><td>{base.scrap}</td><td>{base.completed ? minutes(base.lead) : '—'}</td><td>{result.baselineLast === null ? '—' : minutes(result.baselineLast)}</td><td>—</td></tr>
        {result.cases.map(row => <tr key={row.index}><th scope="row">{stationId(row.index)} · {stations[row.index].name}</th><td>{f(row.early)}</td><td>{f(row.late)}</td><td>{f(row.loss)}</td><td>{row.completed}</td><td>{row.scrap}</td><td>{row.completed ? minutes(row.lead) : '—'}</td><td>{row.last === null ? '—' : minutes(row.last)}</td><td>{row.singlePoint ? 'Yes' : 'No'}</td></tr>)}
      </tbody>
    </table></div>
  </div>
}
