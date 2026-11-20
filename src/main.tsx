import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, Box, ChartNoAxesCombined, ChevronDown, CircleHelp, Clock3, Crosshair, Factory, FlaskConical, Gauge, Layers3, Maximize, Pause, Play, Power, RotateCcw, ScanLine, Settings2, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import type { compareFailures, State } from './simulator'
import { configuration, electricalReference, presets, referenceStator, stations, type Config, type Preset, type StationConfig } from './model'
import { lights, stationId } from './presentation'
import { speeds, useFactory } from './store'
import './style.css'

const FactoryScene = lazy(() => import('./scene').then(module => ({ default: module.FactoryScene })))
const FailureResults = lazy(() => import('./charts').then(module => ({ default: module.FailureResults })))
const Trends = lazy(() => import('./charts').then(module => ({ default: module.Trends })))

const fixed = (number: number) => number.toFixed(1)
const percent = (ratio: number | null) => ratio === null ? '—' : `${fixed(ratio * 100)}%`
function time(seconds: number) {
  const whole = Math.floor(seconds)
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(n => String(n).padStart(2, '0')).join(':')
}
function Status({ state }: { state: State }) {
  return <span className={`status ${state.toLowerCase()}`}><i style={{ background: lights[state] }} />{state}</span>
}
function Metric({ icon, label, value, detail, accent }: { icon: ReactNode; label: string; value: ReactNode; detail: string; accent?: boolean }) {
  return <article className={`metric ${accent ? 'accent' : ''}`}><div>{icon}{label}</div><strong>{value}</strong><small>{detail}</small></article>
}

const stationFields: { key: keyof StationConfig; label: string; min: number; max: number; step: number }[] = [
  { key: 'cycle', label: 'Cycle time (s)', min: 1, max: 3600, step: 1 },
  { key: 'buffer', label: 'Input buffer', min: 1, max: 100, step: 1 },
  { key: 'machines', label: 'Parallel units', min: 1, max: 24, step: 1 },
  { key: 'failureRate', label: 'Failures per unit-hour', min: 0, max: 30, step: 0.01 },
  { key: 'repair', label: 'Repair time (s)', min: 1, max: 7200, step: 1 },
  { key: 'defect', label: 'Defect probability (0–1)', min: 0, max: 1, step: 0.001 },
  { key: 'alternate', label: 'Qualified standby units', min: 0, max: 24, step: 1 },
]

function Settings({ config, station, close, apply }: { config: Config; station: number; close: () => void; apply: (config: Config) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(config))
  const [index, setIndex] = useState(station)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    apply(draft)
  }
  return <dialog ref={dialog} onCancel={close} className="settings">
    <form onSubmit={submit}>
      <div className="panel-head"><div><h2>Simulation settings</h2><p>Apply changes to start a clean, paused run.</p></div><button type="button" className="icon-btn" aria-label="Close settings" onClick={close}><X size={18} /></button></div>
      <div className="fields">
        <label>Demand (stators/hour)<input type="number" min={0} max={720} step={1} value={draft.demand || (draft.demand === 0 ? 0 : '')} required onChange={e => setDraft({ ...draft, demand: e.target.valueAsNumber })} /></label>
        <label>Duration (minutes)<input type="number" min={5} max={1440} step={1} value={Number.isNaN(draft.duration) ? '' : draft.duration / 60} required onChange={e => setDraft({ ...draft, duration: 60 * e.target.valueAsNumber })} /></label>
        <label>Random seed<input type="number" min={0} max={2147483647} step={1} value={Number.isNaN(draft.seed) ? '' : draft.seed} required onChange={e => setDraft({ ...draft, seed: e.target.valueAsNumber })} /></label>
      </div>
      <label className="field-station">Station<select value={index} onChange={e => setIndex(Number(e.target.value))}>{stations.map((cell, i) => <option key={cell.name} value={i}>{stationId(i)} · {cell.name}</option>)}</select></label>
      <div className="fields">{stationFields.map(field => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={field.step} required value={Number.isNaN(draft.stations[index][field.key]) ? '' : draft.stations[index][field.key]} onChange={e => {
        const value = e.target.valueAsNumber
        setDraft(current => ({ ...current, stations: current.stations.map((cell, i) => i === index ? { ...cell, [field.key]: value } : cell) }))
      }} /></label>)}</div>
      <p className="help">Standby units perform only their configured station’s operation and accept queued work when primary equipment is offline or under repair.</p>
      {draft.stations.some(cell => stationFields.some(field => !Number.isFinite(cell[field.key]) || cell[field.key] < field.min || cell[field.key] > field.max)) && <p className="form-error" role="alert">Check the station fields for missing or out-of-range values.</p>}
      <div className="settings-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" className="primary" disabled={draft.stations.some(cell => stationFields.some(field => !Number.isFinite(cell[field.key]) || cell[field.key] < field.min || cell[field.key] > field.max))}>Apply and reset</button></div>
    </form>
  </dialog>
}

function App() {
  const store = useFactory()
  const { sim, data, loss, running, speed, preset, version, restart, toggleRun, setSpeed, setEnabled } = store
  const [selected, setSelected] = useState(0)
  const [focus, setFocus] = useState<{ index: number; token: number } | null>(null)
  const [part, setPart] = useState(false)
  const [geometry, setGeometry] = useState(referenceStator)
  const [tour, setTour] = useState(false)
  const [visible, setVisible] = useState(true)
  const [settings, setSettings] = useState(false)
  const [result, setResult] = useState<{ version: number; value: ReturnType<typeof compareFailures> }>()
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(false)
  const [trendsOpen, setTrendsOpen] = useState(false)
  const [failureOpen, setFailureOpen] = useState(false)
  const [guide, setGuide] = useState(false)
  const failurePanel = useRef<HTMLElement>(null)
  const guideRef = useRef<HTMLDialogElement>(null)
  const station = stations[selected]
  const view = data.stationViews[selected]
  const cfg = sim.config.stations[selected]
  const matches = result?.version === version ? result.value : undefined

  useEffect(() => {
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      useFactory.getState().tick((now - previous) / 1000)
      previous = now
    }, 55)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (guide) guideRef.current?.showModal()
  }, [guide])

  function select(index: number) {
    setSelected(index)
    setPart(false)
    setFocus(current => ({ index, token: (current?.token ?? 0) + 1 }))
  }
  function overview() {
    setTour(false)
    setPart(false)
    setFocus(null)
  }
  function testAll() {
    setFailureOpen(true)
    setAnalyzing(true)
    setAnalysisError(false)
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<ReturnType<typeof compareFailures>>) => {
      setResult({ version, value: event.data })
      setAnalyzing(false)
      worker.terminate()
    }
    worker.onerror = () => {
      setAnalyzing(false)
      setAnalysisError(true)
      worker.terminate()
    }
    worker.postMessage(sim.config)
    requestAnimationFrame(() => failurePanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const bottleneck = data.bottleneck < 0 ? 'Demand limited' : stations[data.bottleneck].name
  const active = data.stationViews.filter(cell => cell.state === 'Operating').length
  return <>
    <header className="masthead"><div className="mast-inner"><div className="brand"><span className="brand-icon"><Factory size={22} /></span><span>EV Hairpin Factory<small>TRACTION MOTOR MANUFACTURING</small></span></div>
      <div className="header-actions"><span className="model-badge"><i /> CONCEPTUAL MODEL</span><button className="icon-btn header-help" onClick={() => setGuide(true)} aria-label="Open model guide" title="Model guide"><CircleHelp size={20} /></button></div></div></header>
    <main>
      <div className="intro"><div><div className="eyebrow"><Activity size={15} /> MANUFACTURING DIGITAL TWIN</div><h1>Production overview</h1><p>Take one machine away. What breaks?</p></div><div className="intro-actions">
        <label className="select-wrap"><span className="sr-only">Factory preset</span><select value={preset} onChange={e => { const value = e.target.value as Preset; restart(configuration(value), value) }}>{presets.map(name => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></label>
        <button onClick={() => setSettings(true)}><Settings2 size={17} /> Settings</button>
        <button className="primary" onClick={testAll} disabled={analyzing}><FlaskConical size={17} /> {analyzing ? 'Running experiments…' : 'Test All Failures'}</button>
      </div></div>
      <div className="metric-grid">
        <Metric icon={<Gauge size={16} />} label="Throughput" value={<>{fixed(data.recentThroughput)} <em>/h</em></>} detail={`${data.completed} completed · trailing 10 min`} />
        <Metric icon={<Clock3 size={16} />} label="Avg. lead time" value={data.completed ? <>{fixed(data.lead / 60)} <em>min</em></> : '—'} detail="Release to finished stator" />
        <Metric icon={<Layers3 size={16} />} label="Work in progress" value={<>{data.wip} <em>units</em></>} detail={`${data.stationViews.reduce((sum, cell) => sum + cell.queue, 0)} waiting in buffers`} />
        <Metric icon={<ShieldCheck size={16} />} label="First-pass yield" value={percent(data.yield)} detail={`${percent(data.scrapRate)} scrap · ${data.rework} reworks`} />
        <Metric icon={<TriangleAlert size={16} />} label="Current bottleneck" accent value={<span className="constraint">{bottleneck}</span>} detail={`${fixed(loss)} stators/h loss vs. no injected fault`} />
      </div>

      <div className="workspace">
        <section className="viewport panel">
          <div className="panel-head viewport-head"><div><h2><Box size={18} /> Factory floor</h2><p>12 stations · EV stator production line</p></div><div className="viewport-actions">
            <button className="icon-btn" aria-label="Reset camera to factory overview" title="Factory overview" onClick={overview}><Maximize size={17} /></button>
            <button aria-label="Tour" aria-pressed={tour} disabled={!visible} title="Focus each station in sequence" onClick={() => { setPart(false); setTour(!tour) }}><ScanLine size={16} /><span>Tour</span></button>
            <button aria-label="Stator" aria-pressed={part} disabled={!visible} onClick={() => { setTour(false); setPart(!part) }}><Box size={16} /><span>Stator</span></button>
            <button aria-pressed={visible} title="Toggle WebGL rendering" onClick={() => { setTour(false); setVisible(!visible) }}>3D</button>
          </div></div>
          <div className="scene">
            <Suspense fallback={<p className="scene-fallback">Loading factory geometry…</p>}><FactoryScene snapshots={data.stationViews} selected={selected} select={select} focus={focus} part={part} tour={tour} visible={visible} geometry={geometry} /></Suspense>
            {visible && <div className="scene-overlay"><span className="scene-eye"><i />{part ? 'REFERENCE STATOR' : 'LINE MONITOR'}</span>
              <span className="scene-tag">{part ? 'Conceptual winding geometry' : `${active} operating / 12 stations`}</span></div>}
            {visible && <div className="scene-guide">Drag to orbit <b>·</b> Right-drag to pan <b>·</b> Scroll to zoom</div>}
          </div>
          {part && visible && <div className="geometry-controls">
            <label>Slots <select value={geometry.slots} onChange={event => setGeometry({ ...geometry, slots: Number(event.target.value) })}>{[36, 48, 60].map(slots => <option key={slots}>{slots}</option>)}</select></label>
            <label>Layers per slot <select value={geometry.layers} onChange={event => setGeometry({ ...geometry, layers: Number(event.target.value) })}>{[2, 4, 6].map(layers => <option key={layers}>{layers}</option>)}</select></label>
          </div>}
          <div className="transport">
            <button className="run-btn" aria-label={running ? 'Pause simulation' : 'Run simulation'} title={running ? 'Pause simulation' : 'Run simulation'} onClick={toggleRun}>{running ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
            <button className="icon-btn" aria-label="Reset simulation" title="Reset simulation" onClick={() => restart()}><RotateCcw size={17} /></button>
            <div className="clock"><span>SIM TIME</span><strong>{time(data.time)}</strong></div>
            <div className="speed" aria-label="Simulation speed">{speeds.map(value => <button key={value} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
          </div>
        </section>

        <aside className="panel inspector">
          <div className="panel-head"><div><h2><Crosshair size={18} /> Station inspector</h2><p>Choose a station to inspect or disable</p></div><span className="inspector-count">12</span></div>
          <div className="station-list">{stations.map((item, i) => <button className={selected === i ? 'chosen' : ''} aria-pressed={selected === i} key={item.name} onClick={() => { setTour(false); select(i) }} title={item.detail}>
            <span className="station-id">{stationId(i)}</span><span>{item.name}</span><i aria-label={data.stationViews[i].state} style={{ background: lights[data.stationViews[i].state] }} />
          </button>)}</div>
          <div className="station-detail">
            <div className="station-title"><h3>{station.name}</h3><Status state={view.state} /></div>
            <p className="equipment">{station.equipment}</p><p className="description">{station.detail}</p>
            <dl><div><dt>Cycle / unit</dt><dd>{cfg.cycle} s</dd></div><div><dt>Utilization</dt><dd>{percent(view.utilization)}</dd></div><div><dt>Input queue</dt><dd>{view.queue} / {cfg.buffer}</dd></div><div><dt>Availability</dt><dd>{percent(view.availability)}</dd></div><div><dt>In process</dt><dd>{view.inProcess} / {cfg.machines + cfg.alternate}</dd></div><div><dt>Standby active</dt><dd>{view.alternateActive} / {cfg.alternate}</dd></div></dl>
            <div className="fault" title="Fault status"><i style={{ background: view.fault === 'No active faults' ? lights.Operating : lights.Failed }} />{view.fault}</div>
            <button className={view.enabled ? 'disable-btn' : 'enable-btn'} onClick={() => setEnabled(selected, !view.enabled)}><Power size={16} />{view.enabled ? 'Disable station' : 'Enable station'}</button>
          </div>
        </aside>
      </div>

      <Suspense fallback={<p className="empty-panel">Loading production charts…</p>}><div className="analytics">
        <section className="panel accordion"><button className="accordion-toggle" aria-expanded={trendsOpen} onClick={() => setTrendsOpen(!trendsOpen)}><span><ChartNoAxesCombined size={19} /> Production trends</span><ChevronDown className={trendsOpen ? 'flipped' : ''} size={18} /></button>{trendsOpen && <Trends history={data.history} views={data.stationViews} />}</section>
        <section className="panel accordion" ref={failurePanel}><button className="accordion-toggle" aria-expanded={failureOpen} onClick={() => setFailureOpen(!failureOpen)}><span><FlaskConical size={19} /> Failure sensitivity</span><ChevronDown className={failureOpen ? 'flipped' : ''} size={18} /></button>{failureOpen && (analyzing ? <p className="empty-panel" role="status">Running a baseline and twelve matched outage experiments…</p> : analysisError ? <p className="empty-panel" role="alert">The analysis worker failed. Run the experiment again to retry.</p> : matches ? <FailureResults result={matches} /> : <p className="empty-panel">Run Test All Failures to compare single-station outages with a seeded baseline.</p>)}</section>
      </div></Suspense>
      <footer><span>EV Hairpin Factory · Educational manufacturing model</span><button onClick={() => setGuide(true)}>Model assumptions <CircleHelp size={15} /></button></footer>
    </main>
    {settings && <Settings config={sim.config} station={selected} close={() => setSettings(false)} apply={config => { restart(config); setSettings(false) }} />}
    {guide && <dialog ref={guideRef} className="settings" onCancel={() => setGuide(false)}><div className="panel-head"><h2>Model assumptions</h2><button className="icon-btn" aria-label="Close model guide" onClick={() => setGuide(false)}><X size={18} /></button></div>
      <div className="guide-content"><p>One kit carries the conductors for one stator. A lined core joins the kit at stator preparation. The default run opens at 25 simulated minutes so you can inspect a populated line. Reset starts from an empty line.</p>
      <p>The reference stator has {referenceStator.slots} slots and {referenceStator.layers} rectangular copper layers per slot, with a design target of {electricalReference.poles} poles and {electricalReference.phases} phases. Geometry variants illustrate conductor packaging only. Phase routing, terminal connections and motor performance require electromagnetic validation.</p>
      <p>Cycle times, machine motions and resin cure are illustrative. The simulation uses configurable probabilities for defects and screening outcomes. It excludes thermal and electromagnetic physics.</p>
      <p>Downtime holds each interrupted job in place. Configured standbys can accept new work from the same input queue. The live bottleneck is the lowest available station capacity, compared with incoming demand. Loss compares trailing output with a matched run that has no injected outage.</p></div>
    </dialog>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
