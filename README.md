# EV Hairpin Factory

EV Hairpin Factory is a browser-based digital twin of a 12-station traction motor stator line. Follow rectangular copper stock through hairpin forming, insertion, welding, curing and final test. Disable equipment to see where work accumulates, which downstream stations starve, and when output falls. The target is [GitHub Pages](https://livonianerd.github.io/ev-hairpin-factory/).

## Run locally

Requires Node.js 20.19+ and npm. Use a WebGL-capable browser for the factory scene.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open the URL printed by Vite, including `/ev-hairpin-factory/`. For a screenshot, fit the factory with the overview control, set the browser viewport to approximately 1440 × 1000, then capture the page. Select **Stator** for a close-up of the core and conductors with adjustable slot and layer counts. These geometry choices leave the process timings at their configured values. The **3D** control suspends rendering while the same simulation clock continues to advance.

## Try an experiment

- The initial view starts 25 simulated minutes into the balanced run. Reset, a preset change, and applied settings start from an empty, paused line.
- Select a station in the scene or inspector and disable it. At 100×, upstream buffers fill and downstream WIP drains faster in wall time. Re-enable the station to resume held jobs.
- **Bottleneck Factory** slows welding from 49 to 105 seconds. **Resilient Factory** increases primary capacity and adds operation-qualified standby equipment for insertion, welding, and curing. Compare the presets from the same starting state and horizon.
- **Test All Failures** runs a baseline and 12 one-at-a-time outages in a worker, with the same settings, seed and horizon. It runs on the configured preset and parameters independently of live toggles. The table compares cumulative completions and scrap, average manufacturing lead time, last completion time, and a structural single-point flag.
- Each outage begins at 35% of the horizon. Immediate throughput is measured over the following 10 minutes or 20% of the horizon, whichever is shorter. Late-run throughput uses the last quarter as a finite-horizon estimate of sustained output. Long cycles and large buffers can keep shipping into that window. A station is structurally a single point of failure when it has no qualified standby, regardless of the measured rate. Use a horizon long enough to drain downstream work.

## Design and metrics

- `src/model.ts` defines the station capabilities, presets, machine parameters and reference stator description.
- `src/simulator.ts` advances simulated time to the next release, completion, failure, repair or metrics sample. Buffers and occupied machines own all accepted work in progress. A completed job holds its machine when the next buffer is full. Unadmitted demand is counted separately. Conservation is `released = WIP + completed + scrap`.
- `src/store.ts` runs the live clock independently of the React Three Fiber viewport. The store also advances a matched reference for trailing output loss. `src/analysis.worker.ts` runs batch comparisons. Recharts displays engine samples.
- Throughput is completed units divided by the measured simulated time. The dashboard uses a trailing 10-minute window or the elapsed time if shorter. Lead time is release to completion among finished stators. First-pass yield is the share of dispositions that completed with no rework, and scrap rate is scrap over all dispositions. Availability is enabled, repair-free primary machine time divided by total primary machine time. Utilization is processing time divided by available machine time across primary and standby units.
- The live bottleneck is the smallest modeled processing capacity among the required operations, based on currently available eligible units, nominal cycle time and expected rework. Demand is the constraint when it falls at or below that capacity. This capacity estimate is distinct from measured output and can identify the constraining outage while downstream stock still ships.

## Manufacturing assumptions

- One modeled workpiece represents the conductor kit for one stator. A supplied laminated core with liner material joins the kit at preparation. Individual wire lengths, upstream supply inventories, transfer time and separate core logistics are abstracted. Conveyor motion illustrates recent transfers, which are instantaneous in the event model.
- Each operation uses an illustrative aggregate kit cycle. Insulation, impregnation and cure are combined into a 540-second residence in one of 12 default parallel positions. Each position holds its job for the full cycle. Cure capacity and dwell are configurable. The 3D rack represents the default 12 positions.
- Equipment failures are seeded exponential up-times per unit and repair takes a configured fixed duration. Disabling a station takes its primary equipment offline and preserves its jobs including blocked completed work. Enabled and repaired units resume their remaining work. Only a standby qualified for that exact operation can pick up queued work. Standbys have their own capacity and failure clocks.
- Configured defects are independent seeded Bernoulli decisions indexed by kit, operation and rework state. A kit can receive one repeat cycle at inspection or welding. Any subsequent defect is scrapped. Electrical testing is represented by a screening probability.
- Three.js geometry and machine kinematics are procedural and simplified. The reference has 48 slots, an 8-pole design target, three phases and four rectangular conductor layers per slot. Copper geometry is conceptual. Slot-pitch selection, phase assignments, circuit topology and weld connections require an independently validated winding specification.
- The simulation is educational. It excludes electromagnetic and thermal physics, material deformation, process control and weld qualification. Rates and cycle times are demonstration inputs, with no claim of production or motor performance validation.

## GitHub Pages

Keep the Vite base at `/ev-hairpin-factory/`. Publish the source to the named repository, review its existing history first, and select **Settings → Pages → Build and deployment → GitHub Actions**. The workflow runs tests and builds on pull requests to `main`. Pushes to `main` and manual runs on `main` upload and deploy `dist/`. Check the workflow and its deployment URL in the repository’s Actions tab.
