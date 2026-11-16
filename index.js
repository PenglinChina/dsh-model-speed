/**
 * Host half of the model-speed plugin.
 *
 * Serves the Web GUI three authenticated routes:
 *  - GET  /plugins/dsh-model-speed/state    configured providers/models plus measurements
 *  - POST /plugins/dsh-model-speed/measure  one short benchmark for an exact route
 *  - GET  /plugins/dsh-model-speed/usage    per-route token usage, day/week/month
 *
 * It also folds real model calls from the live session log into per-route
 * generation speed, using the same math as the sessionStats projection:
 * decode speed = provider output tokens / (assemble time - first token time).
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const STATE_PATH = '/plugins/dsh-model-speed/state'
const MEASURE_PATH = '/plugins/dsh-model-speed/measure'
const USAGE_PATH = '/plugins/dsh-model-speed/usage'

/** How long a provider catalog read stays cached. */
const MODELS_TTL_MS = 30_000
/** One provider's catalog read may not hang the whole page. */
const MODELS_TIMEOUT_MS = 8_000
/** Upper bound for one benchmark call. */
const BENCHMARK_TIMEOUT_MS = 30_000
/** Extra time the enforced deadline allows past the cooperative abort. */
const BENCHMARK_GRACE_MS = 2_000
/** Real samples retained per route for history and distribution. */
const OBSERVED_HISTORY_LIMIT = 60
/** Output cap for one benchmark call. */
const BENCHMARK_MAX_TOKENS = 96
/** Fixed probe instruction; a benchmark is not a conversation. */
const BENCHMARK_SYSTEM = 'You are a speed probe. Follow the counting instruction exactly and answer with the numbers only. Do not explain or use code fences.'
const BENCHMARK_PROMPT = 'Count from 1 to 15 on one line, separated by spaces. Output only the numbers.'
/** A probe below these bounds is a timing artifact, not a decoding speed. */
const BENCHMARK_MIN_TOKENS = 8
const BENCHMARK_MIN_DECODE_MS = 20

/** Cordis plugin name. */
export const name = 'model-speed'
/** The provider registry is the plugin's whole data source. */
export const inject = ['llm']

/** Join a route pair into the map key used by measurements and in-flight calls. */
function routeKey(provider, model) {
  return `${provider}\u0000${model}`
}

/** Local YYYY-MM-DD for one timestamp. */
function localDayKey(time) {
  const date = new Date(time)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local start of today, this week (Monday), and this month. */
function windowStarts(now) {
  const date = new Date(now)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const week = new Date(day)
  week.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  const month = new Date(date.getFullYear(), date.getMonth(), 1)
  return { day: day.getTime(), week: week.getTime(), month: month.getTime() }
}

const ZSTD_FRAME_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

/** Usage events from one multi-frame zstd session log. */
function usageEventsOfCompressedSession(buffer) {
  const starts = []
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (buffer[index] === ZSTD_FRAME_MAGIC[0] && buffer[index + 1] === ZSTD_FRAME_MAGIC[1]
      && buffer[index + 2] === ZSTD_FRAME_MAGIC[2] && buffer[index + 3] === ZSTD_FRAME_MAGIC[3]) {
      starts.push(index)
    }
  }
  const events = []
  for (let index = 0; index < starts.length; index += 1) {
    let text
    try {
      text = zstdDecompressSync(buffer.subarray(starts[index], starts[index + 1] ?? buffer.length)).toString('utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue
      try {
        const parsed = JSON.parse(line)
        const event = parsed.event ?? parsed
        const usage = event?.data?.usage
        const source = event?.data?.message?.source
        if (usage === undefined || usage === null) continue
        if (typeof event?.time !== 'number') continue
        if (typeof source?.provider !== 'string' || typeof source?.model !== 'string') continue
        const input = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
        const output = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
        events.push({ time: event.time, provider: source.provider, model: source.model, input, output })
      } catch {
        continue
      }
    }
  }
  return events
}

/** Add one real usage event into local-day buckets. */
function addRealUsage(buckets, time, key, input, output) {
  const day = localDayKey(time)
  const routes = buckets.get(day) ?? new Map()
  buckets.set(day, routes)
  const entry = routes.get(key) ?? { input: 0, output: 0 }
  entry.input += Math.max(0, Math.round(input))
  entry.output += Math.max(0, Math.round(output))
  routes.set(key, entry)
}

/** Add one benchmark consumption record into local-day buckets. */
function addBenchUsage(buckets, time, key, tokens) {
  const day = localDayKey(time)
  const routes = buckets.get(day) ?? new Map()
  buckets.set(day, routes)
  const entry = routes.get(key) ?? { calls: 0, tokens: 0 }
  entry.calls += 1
  entry.tokens += Math.max(0, Math.round(tokens))
  routes.set(key, entry)
}

/** Provider-reported completion tokens, or null when unreported or invalid. */
function outputTokensOf(usage) {
  if (typeof usage !== 'object' || usage === null) return null
  const value = usage.outputTokens
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Absolute time of the first streamed token in one compact Assistant stream. */
function firstTokenTimeOf(stream) {
  if (!Array.isArray(stream)) return null
  let first = null
  for (const record of stream) {
    if (typeof record !== 'object' || record === null) continue
    let time = null
    if (record.type === 'chunk') {
      const chunk = record.chunk
      if (typeof chunk === 'object' && chunk !== null
        && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta')
        && typeof record.time === 'number') {
        time = record.time
      }
    } else if (record.type === 'text-chunks' || record.type === 'reasoning-chunks') {
      const texts = Array.isArray(record.texts) ? record.texts : []
      if (texts.some((text) => typeof text === 'string' && text.length > 0) && typeof record.time0 === 'number') {
        time = record.time0
      }
    } else if (record.type === 'tool-call-chunks') {
      const args = Array.isArray(record.args) ? record.args : []
      if (args.length > 0 && typeof record.time0 === 'number') time = record.time0
    }
    if (time !== null && (first === null || time < first)) first = time
  }
  return first
}

/** Rough token count for providers that omit a usage report. */
function estimateTokens(text) {
  if (typeof text !== 'string' || text === '') return 1
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/gu) ?? []).length
  const rest = Math.max(0, text.length - cjk)
  return Math.max(1, Math.round(cjk + rest / 4))
}

/** One decimal place without a trailing `.0`. */
function round1(value) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}

/** A safe, user-facing message for any thrown value. */
function formatError(error) {
  if (error === undefined || error === null) return 'unknown error'
  if (typeof error === 'string') return error
  if (typeof error === 'object' && typeof error.message === 'string' && error.message !== '') return error.message
  try {
    return String(error)
  } catch {
    return 'unknown error'
  }
}

/** Reject a promise after a bound so a slow provider cannot stall the page. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** A stable failure category the Client renders as locale text. */
function classifyFailure(message, error) {
  const text = typeof message === 'string' ? message : ''
  if (/arrear|overdue|insufficient (?:balance|funds|quota)|payment|billing|余额|欠费|充值/iu.test(text)) return 'arrears'
  if (/rate.?limit|too many requests|\b429\b/iu.test(text)) return 'rateLimit'
  if (/\b402\b/u.test(text)) return 'arrears'
  if (/unauthori[sz]ed|invalid api key|incorrect api key|forbidden|permission denied|\b401\b|\b403\b/iu.test(text)) return 'auth'
  if (/no adapter route|unknown model|model not found|not supported|unsupported model|\b404\b/iu.test(text)) return 'route'
  if (/timed out after|timeout|etimedout/iu.test(text)) return 'timeout'
  if (/internal server error|bad gateway|service unavailable|gateway timeout|overloaded|\b5\d\d\b/u.test(text)) return 'server'
  if (/fetch failed|econnrefused|econnreset|enotfound|eai_again|network|socket hang up|proxy|certificate|\bdns\b/iu.test(text)) return 'network'
  if (/aborted|abort/iu.test(text)) return 'aborted'
  if (/produced no output/iu.test(text)) return 'empty'
  const status = typeof error?.status === 'number' ? error.status : typeof error?.statusCode === 'number' ? error.statusCode : null
  if (status === 402) return 'arrears'
  if (status === 429) return 'rateLimit'
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'route'
  if (typeof status === 'number' && status >= 500) return 'server'
  return 'unknown'
}

/** Write one JSON response. */
function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

/** The Connection fence raw WebServer routes do not inherit. */
function authorize(ctx, req, res) {
  const connection = ctx.get('connection')
  if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') {
    sendJson(res, 503, { error: 'authentication unavailable' })
    return false
  }
  let rejection
  try {
    rejection = connection.requestRejection(req)
  } catch {
    rejection = 401
  }
  if (rejection === undefined || rejection === null) return true
  const status = typeof rejection === 'number' ? rejection : 401
  sendJson(res, status, { error: status === 401 ? 'unauthorized' : 'forbidden' })
  return false
}

/** Read one bounded JSON object body. */
async function readJsonBody(req, maxBytes = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw === '') return {}
  const value = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('body must be an object')
  return value
}

/**
 * @param ctx Cordis context carrying the `llm` service.
 */
export function apply(ctx) {
  /** routeKey -> { provider, model, observed?, benchmark? } */
  const measurements = new Map()
  /** session id -> open step boundary for the passive sampler */
  const openSteps = new Map()
  /** routeKey -> Promise of an in-flight benchmark */
  const inflight = new Map()
  /** cached provider groups and their timestamp */
  let providers = null
  let providersAt = 0

  /** Real session usage buckets: local day -> routeKey -> { input, output }. */
  let realUsage = null
  /** Live events that land while the first log scan runs. */
  const pendingRealUsage = []
  let scanCutoff = 0
  let scanPromise = null
  let scanFailure = null
  /** Benchmark self-consumption: local day -> routeKey -> { calls, tokens }. */
  let benchUsage = new Map()
  let benchUsageLoaded = false
  const pendingBenchUsage = []

  function ensureEntry(provider, model) {
    const key = routeKey(provider, model)
    let entry = measurements.get(key)
    if (entry === undefined) {
      entry = { provider, model }
      measurements.set(key, entry)
    }
    return entry
  }

  function recordObserved(provider, model, value) {
    const entry = ensureEntry(provider, model)
    const samples = (entry.observed?.samples ?? 0) + 1
    entry.observed = { ...value, samples }
    const history = entry.history ?? (entry.history = [])
    history.push({ tps: value.tps, at: value.at })
    if (history.length > OBSERVED_HISTORY_LIMIT) {
      history.splice(0, history.length - OBSERVED_HISTORY_LIMIT)
    }
  }

  /** Nearest-rank percentile of an ascending numeric array. */
  function percentile(sorted, p) {
    if (sorted.length === 0) return null
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
    return round1(sorted[index])
  }

  /** Distribution of one route's retained real samples. */
  function observedStats(entry) {
    const history = Array.isArray(entry.history) ? entry.history : []
    const values = history
      .map((sample) => sample?.tps)
      .filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
    if (values.length === 0) return null
    const sorted = [...values].sort((left, right) => left - right)
    return {
      window: values.length,
      p50: percentile(sorted, 0.5),
      min: round1(sorted[0]),
      max: round1(sorted[sorted.length - 1]),
      spark: history.slice(-24).map((sample) => round1(sample?.tps)),
    }
  }

  function recordBenchmark(provider, model, value) {
    ensureEntry(provider, model).benchmark = value
  }

  function dshHome() {
    const home = process.env.DSH_HOME
    return typeof home === 'string' && home !== '' ? home : join(homedir(), '.dsh')
  }

  function usageSessionsRoot() {
    const override = process.env.DSH_MODEL_SPEED_SESSIONS_ROOT
    if (typeof override === 'string' && override !== '') return override
    return join(dshHome(), 'sessions')
  }

  function benchUsageFile() {
    const override = process.env.DSH_MODEL_SPEED_USAGE_FILE
    if (typeof override === 'string' && override !== '') return override
    return join(dshHome(), 'cache', 'dsh-model-speed', 'usage.json')
  }

  function recordRealUsage(time, provider, model, input, output) {
    const key = routeKey(provider, model)
    if (realUsage === null) {
      pendingRealUsage.push({ time, key, input, output })
      return
    }
    if (time <= scanCutoff) return
    addRealUsage(realUsage, time, key, input, output)
  }

  async function scanRealUsage() {
    scanCutoff = Date.now()
    const buckets = new Map()
    const root = usageSessionsRoot()
    if (root !== null) {
      const { month } = windowStarts(scanCutoff)
      let entries = []
      try {
        entries = await readdir(root, { recursive: true, withFileTypes: true })
      } catch (error) {
        scanFailure = formatError(error)
        entries = []
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl.zstd')) continue
        const full = join(entry.parentPath ?? root, entry.name)
        try {
          const info = await stat(full)
          if (info.mtimeMs < month) continue
          const buffer = await readFile(full)
          for (const usage of usageEventsOfCompressedSession(buffer)) {
            addRealUsage(buckets, usage.time, routeKey(usage.provider, usage.model), usage.input, usage.output)
          }
        } catch {
          // Unreadable logs keep the rest of the history available.
        }
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
    for (const pending of pendingRealUsage.splice(0)) {
      if (pending.time > scanCutoff) addRealUsage(buckets, pending.time, pending.key, pending.input, pending.output)
    }
    realUsage = buckets
  }

  function ensureRealUsage() {
    if (realUsage !== null) return Promise.resolve(realUsage)
    if (scanPromise === null) {
      scanPromise = scanRealUsage().catch(() => {
        realUsage = new Map()
        return realUsage
      })
    }
    return scanPromise
  }

  async function loadBenchUsage() {
    const file = benchUsageFile()
    const buckets = new Map()
    if (file === null) return buckets
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      for (const [day, routes] of Object.entries(parsed?.days ?? {})) {
        const map = new Map()
        for (const [key, value] of Object.entries(routes)) {
          if (value && typeof value.calls === 'number' && typeof value.tokens === 'number') {
            map.set(key, { calls: value.calls, tokens: value.tokens })
          }
        }
        buckets.set(day, map)
      }
    } catch {
      // A missing or corrupt file starts the counters at zero.
    }
    return buckets
  }

  async function saveBenchUsage() {
    const file = benchUsageFile()
    if (file === null) return
    const days = {}
    for (const [day, routes] of benchUsage) {
      const record = {}
      for (const [key, value] of routes) record[key] = { calls: value.calls, tokens: value.tokens }
      days[day] = record
    }
    try {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify({ days }), 'utf8')
    } catch {
      // Persistence is best-effort; counters still work in memory.
    }
  }

  function recordBenchUsage(provider, model, tokens) {
    if (!benchUsageLoaded) {
      pendingBenchUsage.push({ time: Date.now(), key: routeKey(provider, model), tokens })
      return
    }
    addBenchUsage(benchUsage, Date.now(), routeKey(provider, model), tokens)
    void saveBenchUsage()
  }

  void loadBenchUsage().then((loaded) => {
    benchUsage = loaded
    benchUsageLoaded = true
    for (const pending of pendingBenchUsage.splice(0)) {
      addBenchUsage(benchUsage, pending.time, pending.key, pending.tokens)
    }
  })

  function readProvider(provider) {
    return withTimeout(ctx.llm.listModels(provider.id), MODELS_TIMEOUT_MS).then(
      (listed) => ({
        id: provider.id,
        name: provider.name,
        models: (Array.isArray(listed) ? listed : []).map((model) => ({ id: model.id, name: model.name })),
      }),
      (error) => ({
        id: provider.id,
        name: provider.name,
        models: [],
        error: formatError(error),
      }),
    )
  }

  async function configuredProviders() {
    if (providers !== null && Date.now() - providersAt < MODELS_TTL_MS) return providers
    const groups = await Promise.all(ctx.llm.listProviders().map(readProvider))
    providers = groups
    providersAt = Date.now()
    return groups
  }

  /** Fold one committed event into the passive speed sampler. */
  function sampleEvent(session, event) {
    if (typeof event !== 'object' || event === null) return
    const sessionId = session?.id
    if (typeof sessionId !== 'string') return
    switch (event.type) {
      case 'step/start': {
        openSteps.set(sessionId, {
          turn: event.data?.turn,
          step: event.data?.step,
          startTime: event.time,
          firstTokenTime: null,
        })
        return
      }
      case 'assistant/attempt': {
        const open = openSteps.get(sessionId)
        if (open === undefined || open.turn !== event.data?.turn || open.step !== event.data?.step) return
        if (open.firstTokenTime !== null) return
        const first = firstTokenTimeOf(event.data?.stream)
        if (first !== null) open.firstTokenTime = first
        return
      }
      case 'assistant/message': {
        const open = openSteps.get(sessionId)
        if (open === undefined || open.turn !== event.data?.turn || open.step !== event.data?.step) return
        const source = event.data?.message?.source
        if (typeof source !== 'object' || source === null || source.kind !== 'model') return
        if (typeof source.provider !== 'string' || typeof source.model !== 'string') return
        const tokens = outputTokensOf(event.data?.usage)
        if (tokens === null || tokens <= 0) return
        const first = open.firstTokenTime ?? firstTokenTimeOf(event.data?.stream)
        if (first === null) return
        const decodeMs = event.time - first
        if (!(decodeMs > 0)) return
        recordObserved(source.provider, source.model, {
          tps: round1(tokens / (decodeMs / 1000)),
          ttftMs: Math.max(0, Math.round(first - open.startTime)),
          tokens,
          decodeMs: Math.round(decodeMs),
          at: Date.now(),
        })
        recordRealUsage(
          event.time,
          source.provider,
          source.model,
          typeof event.data?.usage?.inputTokens === 'number' ? event.data.usage.inputTokens : 0,
          tokens,
        )
        openSteps.delete(sessionId)
        return
      }
      case 'step/end':
      case 'turn/end': {
        openSteps.delete(sessionId)
        return
      }
      default:
        return
    }
  }

  /** One short benchmark against an exact route. */
  async function runBenchmark(provider, model) {
    const started = performance.now()
    const controller = new AbortController()
    // Cooperative half of the deadline: a well-behaved adapter cancels here.
    const cooperative = setTimeout(() => controller.abort(), BENCHMARK_TIMEOUT_MS)
    // Enforcement half: an adapter that ignores the signal must not keep the
    // benchmark, and its in-flight entry, pending forever.
    let enforce
    const deadline = new Promise((_, reject) => {
      enforce = setTimeout(
        () => reject(new Error(`timed out after ${BENCHMARK_TIMEOUT_MS} ms`)),
        BENCHMARK_TIMEOUT_MS + BENCHMARK_GRACE_MS,
      )
    })
    let firstToken = null
    let lastToken = null
    let finishTime = null
    let usageTokens = null
    let benchmarkUsage = null
    let sampleText = ''
    const consume = (async () => {
      const call = await ctx.llm.prepareCall(
        { provider, model, maxTokens: BENCHMARK_MAX_TOKENS, temperature: 0 },
        controller.signal,
        (controls, info) => {
          const effort = info?.reasoning?.efforts?.[0]?.id
          return effort === undefined ? controls : { ...controls, reasoningEffort: effort }
        },
      )
      const options = {
        ...call.config,
        messages: [{ role: 'user', content: [{ type: 'text', text: BENCHMARK_PROMPT }] }],
        system: BENCHMARK_SYSTEM,
        signal: controller.signal,
      }
      for await (const chunk of call.stream(options)) {
        const time = performance.now()
        if (typeof chunk !== 'object' || chunk === null) continue
        switch (chunk.type) {
          case 'text-delta':
          case 'reasoning-delta': {
            if (typeof chunk.text === 'string') sampleText += chunk.text
            if (firstToken === null) firstToken = time
            lastToken = time
            break
          }
          case 'tool-call-delta': {
            if (firstToken === null) firstToken = time
            lastToken = time
            break
          }
          case 'usage': {
            const value = outputTokensOf(chunk.usage)
            if (value !== null) usageTokens = value
            benchmarkUsage = chunk.usage ?? null
            break
          }
          case 'finish': {
            finishTime = time
            const kind = chunk.reason?.kind
            if (kind === 'error' || kind === 'aborted') {
              const failure = chunk.reason?.failure
              throw new Error(typeof failure?.message === 'string' && failure.message !== '' ? failure.message : kind)
            }
            break
          }
          default:
            break
        }
      }
    })()
    try {
      await Promise.race([consume, deadline])
    } catch (error) {
      const timedOut = controller.signal.aborted
      const message = timedOut ? `timed out after ${BENCHMARK_TIMEOUT_MS} ms` : formatError(error)
      return { ok: false, error: message, kind: timedOut ? 'timeout' : classifyFailure(message, error) }
    } finally {
      clearTimeout(cooperative)
      clearTimeout(enforce)
    }
    if (usageTokens === null && sampleText === '') {
      return { ok: false, error: 'the model produced no output', kind: 'empty' }
    }
    const estimated = usageTokens === null
    const tokens = estimated ? estimateTokens(sampleText) : usageTokens
    // A provider that buffers its whole answer streamed no token; then the
    // end-to-end request time is the only honest decode window we have.
    const decodeStart = firstToken ?? started
    const decodeEnd = lastToken ?? finishTime ?? performance.now()
    const decodeMs = Math.max(1, decodeEnd - decodeStart)
    const shortSample = tokens < BENCHMARK_MIN_TOKENS || decodeMs < BENCHMARK_MIN_DECODE_MS
    const measurement = {
      tps: round1(tokens / (decodeMs / 1000)),
      ttftMs: firstToken === null ? null : Math.max(0, Math.round(firstToken - started)),
      tokens,
      decodeMs: Math.round(decodeMs),
      estimated,
      shortSample,
      at: Date.now(),
    }
    recordBenchmark(provider, model, measurement)
    return { ok: true, measurement, usage: benchmarkUsage }
  }

  function measure(provider, model) {
    const key = routeKey(provider, model)
    const running = inflight.get(key)
    if (running !== undefined) return running
    const run = runBenchmark(provider, model).then((result) => {
      const entry = ensureEntry(provider, model)
      if (result.ok === true) {
        if (result.measurement?.shortSample !== true) delete entry.lastError
        const usage = result.usage
        const input = usage !== null && typeof usage === 'object' && typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
        const output = usage !== null && typeof usage === 'object' && typeof usage.outputTokens === 'number'
          ? usage.outputTokens
          : (result.measurement?.tokens ?? 0)
        recordBenchUsage(provider, model, input + output)
      } else {
        entry.lastError = {
          at: Date.now(),
          kind: typeof result.kind === 'string' && result.kind !== '' ? result.kind : 'unknown',
          error: typeof result.error === 'string' && result.error !== '' ? result.error : 'benchmark failed',
        }
      }
      return result
    })
    inflight.set(key, run)
    return run.finally(() => {
      inflight.delete(key)
    })
  }

  // Keep the cached catalog honest when the provider topology moves.
  const invalidate = () => {
    providers = null
    providersAt = 0
  }
  ctx.on('llm/adapters-updated', invalidate)
  ctx.on('llm/models-updated', invalidate)

  // Passive sampling: real calls reported by this Host, including subagents.
  ctx.on('session/event', sampleEvent)
  ctx.on('session/disposed', (session) => {
    if (typeof session?.id === 'string') openSteps.delete(session.id)
  })

  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    webCtx.effect(
      () => webServer.register({
        kind: 'exact',
        path: STATE_PATH,
        handler: async (req, res) => {
          if (!authorize(ctx, req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          try {
            const groups = await configuredProviders()
            const snapshot = [...measurements.values()].map((entry) => ({
              provider: entry.provider,
              model: entry.model,
              observed: entry.observed === undefined
                ? undefined
                : { ...entry.observed, stats: observedStats(entry) ?? undefined },
              benchmark: entry.benchmark,
              lastError: entry.lastError,
            }))
            sendJson(res, 200, {
              generatedAt: Date.now(),
              providers: groups,
              measurements: snapshot,
            })
          } catch (error) {
            if (ctx.logger && typeof ctx.logger.warn === 'function') {
              ctx.logger.warn(`[model-speed] state read failed: ${formatError(error)}`)
            }
            sendJson(res, 500, { error: formatError(error) })
          }
        },
      }),
      'model-speed: state route',
    )

    webCtx.effect(
      () => webServer.register({
        kind: 'exact',
        path: MEASURE_PATH,
        handler: async (req, res) => {
          if (!authorize(ctx, req, res)) return
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          let payload
          try {
            payload = await readJsonBody(req)
          } catch (error) {
            sendJson(res, 400, { error: formatError(error) })
            return
          }
          const provider = typeof payload.provider === 'string' ? payload.provider.trim() : ''
          const model = typeof payload.model === 'string' ? payload.model.trim() : ''
          if (provider === '' || model === '') {
            sendJson(res, 400, { error: 'provider and model are required' })
            return
          }
          const result = await measure(provider, model)
          sendJson(res, 200, result)
        },
      }),
      'model-speed: measure route',
    )

    webCtx.effect(
      () => webServer.register({
        kind: 'exact',
        path: USAGE_PATH,
        handler: async (req, res) => {
          if (!authorize(ctx, req, res)) return
          if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          const url = new URL(req.url ?? '/', 'http://dsh.internal')
          const provider = url.searchParams.get('provider') ?? ''
          const model = url.searchParams.get('model') ?? ''
          if (provider === '' || model === '') {
            sendJson(res, 400, { error: 'provider and model are required' })
            return
          }
          try {
            const real = await ensureRealUsage()
            const starts = windowStarts(Date.now())
            const key = routeKey(provider, model)
            const realTotals = {
              day: { input: 0, output: 0 },
              week: { input: 0, output: 0 },
              month: { input: 0, output: 0 },
            }
            const benchTotals = {
              day: { calls: 0, tokens: 0 },
              week: { calls: 0, tokens: 0 },
              month: { calls: 0, tokens: 0 },
            }
            for (const [day, routes] of real) {
              const value = routes.get(key)
              if (value === undefined) continue
              const at = new Date(`${day}T00:00:00`).getTime()
              if (!Number.isFinite(at)) continue
              for (const [name, start] of Object.entries(starts)) {
                if (at < start) continue
                realTotals[name].input += value.input
                realTotals[name].output += value.output
              }
            }
            for (const [day, routes] of benchUsage) {
              const value = routes.get(key)
              if (value === undefined) continue
              const at = new Date(`${day}T00:00:00`).getTime()
              if (!Number.isFinite(at)) continue
              for (const [name, start] of Object.entries(starts)) {
                if (at < start) continue
                benchTotals[name].calls += value.calls
                benchTotals[name].tokens += value.tokens
              }
            }
            sendJson(res, 200, {
              provider,
              model,
              generatedAt: Date.now(),
              scanError: scanFailure ?? undefined,
              real: realTotals,
              bench: benchTotals,
            })
          } catch (error) {
            sendJson(res, 500, { error: formatError(error) })
          }
        },
      }),
      'model-speed: usage route',
    )
  })
}
