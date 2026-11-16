/**
 * Local harness for the model-speed Client half. It installs a tiny module
 * loader and React stand-in, then checks registration wiring and one render of
 * the loading state (no browser needed).
 *
 * Run: node model-speed-test/client.test.mjs
 */

import assert from 'node:assert/strict'

const cleanups = []
let presetState = null
const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity) }
  },
  useState(initial) {
    if (presetState !== null && presetState.length > 0) {
      return [presetState.shift(), () => {}]
    }
    const value = typeof initial === 'function' ? initial() : initial
    return [value, () => {}]
  },
  useEffect(effect) {
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  },
  useRef(value) {
    return { current: value }
  },
}

const registrations = []
let dictionary = null
const ctx = {
  effect(callback) {
    const cleanup = callback()
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  },
  locale: {
    bind() {
      return (key) => key
    },
    register(ns, dicts) {
      dictionary = { ns, dicts }
      return () => {}
    },
  },
  slots: {
    inject(_name, callback) {
      callback()
      return () => {}
    },
    register(options, Component) {
      registrations.push({ options, Component })
      return () => {}
    },
  },
}

let plugin = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      plugin = definition.factory((id) => {
        assert.equal(id, 'react')
        return fakeReact
      })
    },
  },
}

const appended = []

function makeDomNode() {
  return {
    style: {},
    textContent: '',
    children: [],
    attributes: {},
    appendChild(child) {
      this.children.push(child)
      return child
    },
    setAttribute(name, value) {
      this.attributes[name] = value
    },
    remove() {
      this.removed = true
    },
  }
}

globalThis.document = {
  createElement() {
    return makeDomNode()
  },
  body: {
    appendChild(child) {
      appended.push(child)
      return child
    },
  },
}
globalThis.fetch = async () => ({
  ok: false,
  status: 0,
  async json() {
    return {}
  },
})

await import('../client.js')

assert.ok(plugin, 'client module loaded')
assert.deepEqual(plugin.inject, ['slots', 'locale'])

plugin.apply(ctx)

assert.equal(dictionary.ns, 'settings.model-speed')
assert.ok(dictionary.dicts.en && dictionary.dicts.zh, 'both baseline locales registered')
const enKeys = Object.keys(dictionary.dicts.en).sort()
for (const locale of ['zh', 'ja']) {
  assert.deepEqual(Object.keys(dictionary.dicts[locale]).sort(), enKeys, `${locale} shares every key with en`)
}

const section = registrations.find((entry) => entry.options.name === 'settings.section')
const icon = registrations.find((entry) => entry.options.name === 'settings.section.icon')
const dock = registrations.find((entry) => entry.options.name === 'conversation.input.dock')
assert.ok(section, 'settings.section registered')
assert.ok(icon, 'settings.section.icon registered')
assert.ok(dock, 'conversation.input.dock registered')
assert.equal(section.options.id, 'model-speed')
assert.equal(icon.options.id, 'model-speed')
assert.equal(dock.options.id, 'model-speed')
assert.equal(dock.options.locale, 'settings.model-speed')
assert.equal(section.options.locale, 'settings.model-speed')
assert.equal(typeof section.options.label, 'function')
assert.equal(section.options.label(), 'title')
assert.equal(typeof section.Component, 'function')

const tree = section.Component({ t: (key) => key })
assert.equal(tree.type, 'section')
const text = collectText(tree)
assert.ok(text.includes('title'), 'title rendered')
assert.ok(text.includes('description'), 'description rendered')
assert.ok(text.includes('loading'), 'loading state rendered')
assert.ok(text.includes('measure'), 'toolbar rendered')
assert.ok(text.includes('busyHint'), 'footer hint rendered')
assert.ok(text.includes('footer'), 'footer rendered')

const iconTree = icon.Component({ size: 16, active: true })
assert.equal(iconTree.type, 'svg')
assert.equal(iconTree.props.width, 16)

const dockShell = dock.Component({ t: (key) => key })
assert.equal(typeof dockShell.type, 'function')
const dockTree = dockShell.type(dockShell.props)
const dockText = collectText(dockTree)
assert.equal(dockTree.type, 'section')
assert.ok(dockText.includes('title'), 'dock title rendered')
assert.ok(dockText.includes('loading'), 'dock loading state rendered')
assert.ok(dockText.includes('measure'), 'dock action rendered')

// Rendered data: real speed first, live distribution, probe delta.
{
  const measurements = [{
    provider: 'alpha',
    model: 'alpha-fast',
    observed: {
      tps: 20,
      ttftMs: 300,
      tokens: 10,
      decodeMs: 500,
      at: Date.now() - 120_000,
      samples: 3,
      stats: { window: 3, p50: 10, min: 8, max: 20, spark: [20, 10, 8] },
    },
    benchmark: {
      tps: 25,
      ttftMs: 200,
      tokens: 10,
      decodeMs: 400,
      estimated: false,
      at: Date.now() - 60_000,
    },
  }]
  const readyState = {
    status: 'ready',
    providers: [{ id: 'alpha', name: 'Alpha', models: [{ id: 'alpha-fast', name: 'Fast' }] }],
    measurements,
    error: '',
  }
  const presetReady = () => [false, readyState, null, null, {}]

  presetState = presetReady()
  const pageTree = section.Component({ t: (key) => key })
  const pageText = collectText(pageTree)
  assert.ok(pageText.includes('20.0/25.0'), 'speeds pair as live/bench')
  assert.ok(pageText.includes('p50'), 'live distribution rendered')
  assert.ok(pageText.includes('delta+25%'), 'probe delta rendered')
  assert.ok(hasType(pageTree, 'svg'), 'sparkline rendered')

  presetState = presetReady()
  const dockData = dockShell.type(dockShell.props)
  const dockDataText = collectText(dockData)
  assert.ok(dockDataText.includes('20.0/25.0'), 'dock pairs live and bench')
  assert.ok(dockDataText.includes('tagLive/tagBench'), 'dock legend explains the order')
  presetState = null
}

// A too-short probe is labeled, never rendered as a decoding speed.
{
  const measurements = [{
    provider: 'alpha',
    model: 'alpha-fast',
    observed: {
      tps: 20,
      ttftMs: 300,
      tokens: 10,
      decodeMs: 500,
      at: Date.now() - 120_000,
      samples: 3,
      stats: { window: 3, p50: 10, min: 8, max: 20, spark: [20, 10, 8] },
    },
    benchmark: {
      tps: 1000,
      ttftMs: 600,
      tokens: 1,
      decodeMs: 1,
      estimated: false,
      shortSample: true,
      at: Date.now() - 60_000,
    },
  }]
  const readyState = {
    status: 'ready',
    providers: [{ id: 'alpha', name: 'Alpha', models: [{ id: 'alpha-fast', name: 'Fast' }] }],
    measurements,
    error: '',
  }
  const presetReady = () => [false, readyState, null, null, {}]

  presetState = presetReady()
  const pageTree = section.Component({ t: (key) => key })
  const pageText = collectText(pageTree)
  assert.ok(pageText.includes('shortSample'), 'short probe is labeled')
  assert.ok(!pageText.includes('1000'), 'short probe speed is never shown')
  assert.ok(pageText.includes('20.0'), 'live speed still drives the number')

  presetState = presetReady()
  const dockTree = dockShell.type(dockShell.props)
  const dockText = collectText(dockTree)
  assert.ok(dockText.includes('20.0'), 'dock keeps the live speed')
  assert.ok(!dockText.includes('1000'), 'dock never shows the artifact speed')
  assert.ok(!dockText.includes('20.0/'), 'short probe is excluded from the pair')
  presetState = null
}

// A failed benchmark renders a localized reason, never the raw provider body.
{
  const measurements = [{
    provider: 'alpha',
    model: 'alpha-fast',
    lastError: { at: Date.now(), kind: 'arrears', error: '400: {"code":"Arrearage","message":"Access denied"}' },
  }]
  const readyState = {
    status: 'ready',
    providers: [{ id: 'alpha', name: 'Alpha', models: [{ id: 'alpha-fast', name: 'Fast' }] }],
    measurements,
    error: '',
  }
  const presetReady = () => [false, readyState, null, null, {}]

  presetState = presetReady()
  const pageTree = section.Component({ t: (key) => key })
  const pageText = collectText(pageTree)
  assert.ok(pageText.includes('errArrears'), 'reason rendered from the kind')
  assert.ok(!pageText.includes('400:'), 'raw provider code omitted from the text')

  presetState = presetReady()
  const dockTree = dockShell.type(dockShell.props)
  const dockText = collectText(dockTree)
  assert.ok(dockText.includes('errArrears'), 'dock shows the reason too')
  presetState = null
}

// A hover card renders this route's usage, not the speed details.
{
  const measurements = [{ provider: 'alpha', model: 'alpha-fast' }]
  const readyState = {
    status: 'ready',
    providers: [{ id: 'alpha', name: 'Alpha', models: [{ id: 'alpha-fast', name: 'Fast' }] }],
    measurements,
    error: '',
  }
  const popup = {
    key: 'alpha\u0000alpha-fast',
    group: { id: 'alpha', name: 'Alpha', models: [] },
    model: { id: 'alpha-fast', name: 'Fast' },
    rect: { left: 10, top: 300, bottom: 310 },
    status: 'ready',
    data: {
      real: {
        day: { input: 100, output: 50 },
        week: { input: 1_000, output: 500 },
        month: { input: 4_000, output: 2_000 },
      },
      bench: {
        day: { calls: 2, tokens: 120 },
        week: { calls: 9, tokens: 540 },
        month: { calls: 30, tokens: 1_800 },
      },
    },
  }
  presetState = [false, readyState, null, null, {}, popup]
  dockShell.type(dockShell.props)
  const cardText = nodeText(appended[appended.length - 1])
  assert.ok(cardText.includes('usageTitle'), 'usage title rendered')
  assert.ok(cardText.includes('usageDay'), 'day row rendered')
  assert.ok(!cardText.includes('usageReal'), 'no real/probe split label')
  assert.ok(cardText.includes('270'), 'combined day total rendered')
  assert.ok(!cardText.includes('tok'), 'no unit suffix')
  presetState = null
}

for (const cleanup of cleanups) cleanup()
console.log('all client harness checks passed')

function hasType(node, type) {
  if (node === null || node === undefined || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some((child) => hasType(child, type))
  if (node.type === type) return true
  // The stand-in never renders function components; expand them like React.
  if (typeof node.type === 'function') return hasType(node.type(node.props), type)
  return hasType(node.children, type)
}

function nodeText(node) {
  if (!node) return ''
  const own = typeof node.textContent === 'string' ? node.textContent : ''
  const children = Array.isArray(node.children) ? node.children.map(nodeText).join(' ') : ''
  return `${own} ${children}`
}

function collectText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  // The stand-in never renders function components; expand them like React.
  if (typeof node.type === 'function') return collectText(node.type(node.props))
  return collectText(node.children)
}
