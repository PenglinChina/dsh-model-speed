/**
 * Local harness for the model-speed Host half. It fakes the Cordis context so
 * the routes, passive sampler, and benchmark math can be exercised without the
 * running Editor.
 *
 * Run: node model-speed-test/host.test.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name } from '../index.js'

// Keep benchmark-usage persistence away from the real Harness home.
process.env.DSH_MODEL_SPEED_USAGE_FILE = join(mkdtempSync(join(tmpdir(), 'model-speed-usage-')), 'usage.json')

function routeKey(provider, model) {
  return provider + '\u0000' + model
}

function makeReq(method, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  return {
    method,
    url: '/',
    headers: {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function makeRes() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body
    },
  }
}

function parse(res) {
  return JSON.parse(res.body)
}

function fakeStream(delays, text) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        yield { type: 'text-delta', index: 0, text }
      }
      yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 10 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

const listeners = new Map()
const routes = new Map()
const llmCalls = []
const connection = { requestRejection: () => undefined }

const ctx = {
  get(service) {
    if (service === 'connection') return connection
    return undefined
  },
  on(event, listener) {
    listeners.set(event, listener)
    return () => listeners.delete(event)
  },
  inject(deps, callback) {
    if (deps.includes('webServer')) callback(ctx)
  },
  effect(callback) {
    return callback()
  },
  logger: { warn() {} },
  llm: {
    listProviders() {
      return [
        { id: 'alpha', name: 'Alpha Provider' },
        { id: 'beta', name: 'Beta Provider' },
        { id: 'broken', name: 'Broken Provider' },
      ]
    },
    async listModels(provider) {
      if (provider === 'broken') throw new Error('catalog unavailable')
      return [
        { provider, id: `${provider}-fast`, name: `${provider} Fast` },
        { provider, id: `${provider}-small`, name: `${provider} Small` },
      ]
    },
    async prepareCall(config, signal, configure) {
      if (config.model === 'nope') throw new Error('no adapter route for ghost/nope')
      if (config.model === 'arrears') throw new Error('400: {"message":"Access denied","type":"Arrearage"}')
      const controls = configure({ temperature: 0 }, { reasoning: { efforts: [{ id: 'off' }] } })
      return {
        config: { provider: config.provider, model: config.model, maxTokens: config.maxTokens, ...controls },
        stream(options) {
          llmCalls.push({ config, controls, options })
          if (options.model === 'buffered') {
            return {
              async *[Symbol.asyncIterator]() {
                await new Promise((resolve) => setTimeout(resolve, 30))
                yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 12 } }
                yield { type: 'finish', reason: { kind: 'stop' } }
              },
            }
          }
          if (options.model === 'stalled') {
            // The worst case: never yields, and ignores the abort signal.
            return {
              async *[Symbol.asyncIterator]() {
                await new Promise(() => {})
              },
            }
          }
          if (options.model === 'short') {
            // A compliant probe that settles inside one millisecond.
            return {
              async *[Symbol.asyncIterator]() {
                yield { type: 'text-delta', index: 0, text: 'OK' }
                yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } }
                yield { type: 'finish', reason: { kind: 'stop' } }
              },
            }
          }
          return fakeStream([8, 8, 8, 8], 'OK ')
        },
      }
    },
  },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
}

apply(ctx)

assert.equal(inject.includes('llm'), true)
assert.equal(typeof name, 'string')

const stateRoute = routes.get('/plugins/dsh-model-speed/state')
const measureRoute = routes.get('/plugins/dsh-model-speed/measure')
const usageRoute = routes.get('/plugins/dsh-model-speed/usage')
assert.ok(stateRoute, 'state route registered')
assert.ok(measureRoute, 'measure route registered')
assert.ok(usageRoute, 'usage route registered')

// 1. Catalog listing, including one failing provider.
{
  const res = makeRes()
  await stateRoute.handler(makeReq('GET'), res)
  assert.equal(res.status, 200)
  const data = parse(res)
  const alpha = data.providers.find((provider) => provider.id === 'alpha')
  const broken = data.providers.find((provider) => provider.id === 'broken')
  assert.equal(alpha.models.length, 2)
  assert.equal(alpha.models[0].id, 'alpha-fast')
  assert.equal(broken.models.length, 0)
  assert.match(broken.error, /catalog unavailable/u)
  console.log('catalog listing OK')
}

// 2. One benchmark: route validation, measurement math, dedupe.
{
  const bad = makeRes()
  await measureRoute.handler(makeReq('POST', { provider: 'alpha' }), bad)
  assert.equal(bad.status, 400)

  const res = makeRes()
  await measureRoute.handler(makeReq('POST', { provider: 'alpha', model: 'alpha-fast' }), res)
  assert.equal(res.status, 200)
  const data = parse(res)
  assert.equal(data.ok, true)
  assert.ok(data.measurement.tps > 0, 'positive tokens per second')
  assert.ok(data.measurement.ttftMs >= 0)
  assert.equal(data.measurement.tokens, 10)
  assert.equal(data.measurement.estimated, false)
  assert.equal(data.measurement.shortSample, false)
  assert.equal(llmCalls.length, 1)
  assert.equal(llmCalls[0].config.model, 'alpha-fast')
  assert.equal(llmCalls[0].controls.reasoningEffort, 'off')
  assert.equal(
    llmCalls[0].options.messages[0].content[0].text,
    'Count from 1 to 15 on one line, separated by spaces. Output only the numbers.',
  )
  console.log('benchmark route OK:', data.measurement.tps, 'tok/s')

  // The benchmark is visible in state.
  const state = makeRes()
  await stateRoute.handler(makeReq('GET'), state)
  const listed = parse(state).measurements.find(
    (entry) => entry.provider === 'alpha' && entry.model === 'alpha-fast',
  )
  assert.ok(listed && listed.benchmark, 'benchmark persisted in memory')
  assert.equal(listed.lastError, undefined, 'success clears the failure status')
  console.log('measurement snapshot OK')
}

// 3. Passive sampling from a committed assistant message.
{
  const listener = listeners.get('session/event')
  assert.equal(typeof listener, 'function')
  const session = { id: 'session-test' }
  const t0 = Date.now()
  listener(session, { type: 'step/start', time: t0, data: { turn: 0, step: 0 } })
  listener(session, {
    type: 'assistant/attempt',
    time: t0 + 30,
    data: {
      turn: 0,
      step: 0,
      stream: [{ type: 'text-chunks', time0: t0 + 250, index: 0, dt: [10, 10], texts: ['a', 'b'] }],
    },
  })
  listener(session, {
    type: 'assistant/message',
    time: t0 + 1250,
    data: {
      turn: 0,
      step: 0,
      usage: { inputTokens: 100, outputTokens: 40 },
      stream: [],
      message: { source: { kind: 'model', provider: 'alpha', model: 'alpha-small' } },
    },
  })

  const state = makeRes()
  await stateRoute.handler(makeReq('GET'), state)
  const entry = parse(state).measurements.find(
    (item) => item.provider === 'alpha' && item.model === 'alpha-small',
  )
  assert.ok(entry && entry.observed, 'observed sample recorded')
  assert.equal(entry.observed.tokens, 40)
  assert.equal(entry.observed.ttftMs, 250)
  assert.equal(entry.observed.tps, 40)
  assert.equal(entry.observed.samples, 1)
  console.log('passive sampling OK:', entry.observed.tps, 'tok/s')
}

// 4. Unauthenticated routes are refused.
{
  const original = connection.requestRejection
  connection.requestRejection = () => 401
  const res = makeRes()
  await stateRoute.handler(makeReq('GET'), res)
  assert.equal(res.status, 401)
  connection.requestRejection = original
  console.log('auth fence OK')
}

// 5. An unavailable route still returns a structured failure, not a crash.
{
  const res = makeRes()
  await measureRoute.handler(makeReq('POST', { provider: 'ghost', model: 'nope' }), res)
  assert.equal(res.status, 200)
  const data = parse(res)
  assert.equal(data.ok, false)
  assert.match(data.error, /no adapter route/u)
  assert.equal(data.kind, 'route')

  const state = makeRes()
  await stateRoute.handler(makeReq('GET'), state)
  const failed = parse(state).measurements.find(
    (entry) => entry.provider === 'ghost' && entry.model === 'nope',
  )
  assert.ok(failed && failed.lastError, 'failed benchmark recorded for the status dot')
  assert.equal(failed.lastError.kind, 'route')
  assert.match(failed.lastError.error, /no adapter route/u)
  console.log('structured failure OK')
}

// 6. A provider that streams no delta still gets an end-to-end speed, not 1 ms.
{
  const res = makeRes()
  await measureRoute.handler(makeReq('POST', { provider: 'alpha', model: 'buffered' }), res)
  assert.equal(res.status, 200)
  const data = parse(res)
  assert.equal(data.ok, true)
  assert.equal(data.measurement.ttftMs, null)
  assert.ok(data.measurement.tps > 0)
  assert.ok(data.measurement.tps < 10000, 'buffered speed stays plausible')
  console.log('buffered provider OK:', data.measurement.tps, 'tok/s')
}

// 7. A provider that ignores the abort signal must not keep the benchmark, or
//    its in-flight entry, pending forever: the enforced deadline settles it.
{
  const realSetTimeout = globalThis.setTimeout
  // Compress both deadline timers (30 s cooperative, 32 s enforced) so this
  // check runs in milliseconds instead of half a minute.
  globalThis.setTimeout = (callback, delay, ...args) => realSetTimeout(callback, Math.min(delay, 40), ...args)
  try {
    const first = makeRes()
    await measureRoute.handler(makeReq('POST', { provider: 'alpha', model: 'stalled' }), first)
    assert.equal(first.status, 200)
    assert.equal(parse(first).ok, false)
    assert.equal(parse(first).kind, 'timeout')
    assert.match(parse(first).error, /timed out after 30000/u)

    const before = llmCalls.length
    const retry = makeRes()
    await measureRoute.handler(makeReq('POST', { provider: 'alpha', model: 'stalled' }), retry)
    assert.equal(parse(retry).ok, false)
    assert.equal(llmCalls.length, before + 1, 'a stalled route is retryable: the in-flight entry was released')

    const state = makeRes()
    await stateRoute.handler(makeReq('GET'), state)
    const stalled = parse(state).measurements.find(
      (entry) => entry.provider === 'alpha' && entry.model === 'stalled',
    )
    assert.ok(stalled && stalled.lastError, 'stalled benchmark recorded for the status dot')
    assert.match(stalled.lastError.error, /timed out/u)
    console.log('non-cooperative stall OK: enforced deadline settled the benchmark')
  } finally {
    globalThis.setTimeout = realSetTimeout
  }
}

// 8. Real samples keep a bounded history and a distribution summary.
{
  const listener = listeners.get('session/event')
  const sessionId = 'session-stats'
  const emit = (base, tokens, decodeMs) => {
    listener({ id: sessionId }, { type: 'step/start', time: base, data: { turn: 0, step: 0 } })
    listener({ id: sessionId }, {
      type: 'assistant/attempt',
      time: base + 100,
      data: {
        turn: 0,
        step: 0,
        stream: [{ type: 'text-chunks', time0: base + 100, index: 0, dt: [10], texts: ['x'] }],
      },
    })
    listener({ id: sessionId }, {
      type: 'assistant/message',
      time: base + 100 + decodeMs,
      data: {
        turn: 0,
        step: 0,
        usage: { inputTokens: 100, outputTokens: tokens },
        stream: [],
        message: { source: { kind: 'model', provider: 'alpha', model: 'alpha-fast' } },
      },
    })
  }
  const now = Date.now()
  emit(now, 10, 500)             // 20 tok/s
  emit(now + 90_000, 10, 1_000)  // 10 tok/s
  emit(now + 180_000, 10, 1_250) // 8 tok/s

  const state = makeRes()
  await stateRoute.handler(makeReq('GET'), state)
  const entry = parse(state).measurements.find(
    (item) => item.provider === 'alpha' && item.model === 'alpha-fast',
  )
  assert.ok(entry && entry.observed, 'real samples recorded')
  assert.equal(entry.observed.samples, 3)
  assert.equal(entry.observed.tps, 8, 'the newest real sample wins')
  assert.ok(entry.observed.stats, 'distribution summary present')
  assert.equal(entry.observed.stats.window, 3)
  assert.equal(entry.observed.stats.p50, 10)
  assert.equal(entry.observed.stats.min, 8)
  assert.equal(entry.observed.stats.max, 20)
  assert.deepEqual(entry.observed.stats.spark, [20, 10, 8])
  assert.equal('history' in entry, false, 'raw history stays on the Host')
  assert.ok(entry.benchmark, 'benchmark and real samples coexist for the delta view')
  console.log('real history distribution OK:', JSON.stringify(entry.observed.stats))
}

// 9. A probe that settles inside one millisecond is flagged, never stored as a
//    speed, and does not mark the route as failed.
{
  const res = makeRes()
  await measureRoute.handler(makeReq('POST', { provider: 'alpha', model: 'short' }), res)
  assert.equal(res.status, 200)
  const data = parse(res)
  assert.equal(data.ok, true)
  assert.equal(data.measurement.shortSample, true)
  assert.equal(data.measurement.tokens, 1)

  const state = makeRes()
  await stateRoute.handler(makeReq('GET'), state)
  const entry = parse(state).measurements.find(
    (item) => item.provider === 'alpha' && item.model === 'short',
  )
  assert.ok(entry && entry.benchmark, 'short probe still recorded for the tooltip')
  assert.equal(entry.benchmark.shortSample, true)
  assert.equal(entry.lastError, undefined, 'a short probe is not a route failure')
  console.log('short-sample gate OK')
}

// 10. Failures carry a stable reason kind; the raw body stays as detail only.
{
  const res = makeRes()
  await measureRoute.handler(makeReq('POST', { provider: 'alpha', model: 'arrears' }), res)
  assert.equal(res.status, 200)
  const data = parse(res)
  assert.equal(data.ok, false)
  assert.equal(data.kind, 'arrears')
  assert.match(data.error, /Arrearage/u)

  const state = makeRes()
  await stateRoute.handler(makeReq('GET'), state)
  const entry = parse(state).measurements.find(
    (item) => item.provider === 'alpha' && item.model === 'arrears',
  )
  assert.ok(entry && entry.lastError, 'classified failure recorded')
  assert.equal(entry.lastError.kind, 'arrears')
  assert.match(entry.lastError.error, /Arrearage/u)
  console.log('failure classification OK')
}

// 11. The usage route validates its route pair before any log scan.
{
  const bad = makeRes()
  await usageRoute.handler(makeReq('GET'), bad)
  assert.equal(bad.status, 400)
  console.log('usage route validation OK')
}

assert.equal(typeof routeKey('a', 'b'), 'string')
console.log('all host harness checks passed')
