import type { Config } from './model'
import { compareFailures } from './simulator'

self.onmessage = (event: MessageEvent<Config>) => self.postMessage(compareFailures(event.data))
