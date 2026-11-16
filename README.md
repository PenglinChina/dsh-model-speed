# dsh-model-speed

DeepSeek Harness (DSH) plugin that shows the **live generation speed and token usage** of the models configured in your current profile — inside one minimal row under the composer, with no extra panels to open.

## Features

- **Real traffic, zero extra cost.** While you chat, every committed model reply is sampled (provider usage + stream timings), so the number reflects what your routes actually deliver — including network jitter and provider throttling.
- **On-demand benchmark.** One click sends a very short counting probe through DSH's provider runtime, guarded by a hard 32 s deadline, a minimum-sample gate (8 output tokens / 20 ms decode window) and a buffered-stream fallback.
- **Live vs probe pair.** The dock chip reads `live/probe tok/s`; the settings page adds the Δ between the two and a distribution over the retained live samples (p50, min–max, sparkline).
- **Status at a glance.** Red/green dots reflect the last benchmark, and failures are classified into human reasons — arrears, auth, rate limit, missing route, timeout, provider server error, local network, empty output — with the raw provider body kept only in the tooltip.
- **Usage on hover.** Hover a model's speed number for today / this week / this month token usage, combining real session usage with this plugin's own probe consumption.
- **Local only.** Real usage is aggregated from your own session logs under `~/.dsh/sessions`; nothing is uploaded and the only outbound requests are the benchmarks you trigger.

## Install

```bash
dsh plugin --profile web add dsh-model-speed
```

Pinning a Git commit is also supported:

```bash
dsh plugin --profile web add git+https://github.com/YOUR_NAME/dsh-model-speed.git#<40-char-commit>
```

For a local checkout, point DSH at the directory (Plugins → Add plugin, or the CLI with the absolute path).

After enabling the plugin, open **Settings → Model speed** for the full panel; the compact row appears under the composer.

## Requirements

- DeepSeek Harness `>= 0.2.0`
- A Web profile (Desktop or `dsh web`)

## Languages

The UI follows the Harness language setting. **English**, **简体中文** and **日本語** are translated; every other language falls back to English.

## How it measures

- **Live speed** = provider output tokens ÷ decode window, where the window is first token → committed message. Only real turns are sampled.
- **Probe speed** = tokens ÷ window from one short probe. Probes with fewer than 8 output tokens or a decode window under 20 ms are marked as *sample too short* instead of being shown as a speed.
- Live samples are kept in memory (up to 60 per route) and reset when the Host restarts; probe usage counters persist under `$DSH_HOME/cache/dsh-model-speed/usage.json`.

## Privacy

The plugin reads your local session logs and provider catalog only. No telemetry, no remote service, no credentials leave the machine.

## Development

```bash
node --check index.js
node --check client.js
npm test
```

The test harness fakes the Cordis context and React, so no DSH instance is required.

## License

MIT — see [LICENSE](LICENSE).
