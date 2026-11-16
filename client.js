/**
 * Client half of the model-speed plugin: one Settings page under
 * Settings → Model speed, plus its navigation icon.
 *
 * The page reads measured speed from the Host's authenticated routes; it never
 * calls a provider itself and owns no persistent state.
 */

window.__ModuleLoader__.load({
  id: 'dsh-model-speed',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'settings.model-speed'
    const STATE_URL = '/plugins/dsh-model-speed/state'
    const MEASURE_URL = '/plugins/dsh-model-speed/measure'
    const USAGE_URL = '/plugins/dsh-model-speed/usage'

    const DICTIONARIES = {
      en: {
        title: 'Model speed',
        description:
          'Generation speed (tok/s) of the models configured in this profile, from live conversation samples and on-demand benchmarks.',
        measure: 'Benchmark',
        measuring: 'Benchmarking…',
        measureAll: 'Benchmark all',
        measuringAll: 'Benchmarking',
        refresh: 'Refresh',
        retry: 'Retry',
        loading: 'Reading configured models…',
        loadFailed: 'Could not read model data: ',
        empty: 'No configured models were found.',
        providerFailed: 'This provider could not list its models: ',
        notMeasured: 'Not measured',
        ttft: 'TTFT',
        samples: 'samples',
        footer:
          'Speed is output tokens divided by the decode window (first token to message). Paired speeds read live/bench; distribution covers the retained live samples; Δ is the benchmark versus live traffic. A probe below 8 tokens or 20 ms is marked too short instead of shown as a speed. Samples reset when the Host restarts.',
        busyHint: 'A benchmark sends one very short request to the model and may use a little quota.',
        justNow: 'just now',
        minutesAgo: 'min ago',
        hoursAgo: 'h ago',
        daysAgo: 'd ago',
        failed: 'Benchmark failed: ',
        errTimeout: 'timed out; retry later or check the provider',
        errArrears: 'account in arrears or out of balance',
        errAuth: 'authentication rejected; check the API key',
        errRateLimit: 'rate limited; retry later',
        errNetwork: 'local network failure; check the connection or proxy',
        errServer: 'provider server error; retry later',
        errRoute: 'no route to this model',
        errEmpty: 'the model produced no output',
        errAborted: 'the request was interrupted',
        errUnknown: 'reason unknown',
        usageTitle: 'Usage stats',
        usageDay: 'Today',
        usageWeek: 'This week',
        usageMonth: 'This month',
        usageLoading: 'Reading usage…',
        usageFailed: 'Usage unavailable',
        tagBench: 'Bench',
        tagLive: 'Live',
        collapse: 'Collapse',
        expand: 'Expand',
        measured: 'measured',
        p50: 'p50',
        delta: 'Δ',
        shortSample: 'Sample too short',
        statusOk: 'Benchmark succeeded',
        statusError: 'Benchmark failed',
      },
      zh: {
        title: '模型速度',
        description: '查看本配置中已配置模型的生成速度（tok/s）。数据来自实际对话采样和手动测速。',
        measure: '测速',
        measuring: '测速中…',
        measureAll: '全部测速',
        measuringAll: '测速中',
        refresh: '刷新',
        retry: '重试',
        loading: '正在读取已配置的模型…',
        loadFailed: '无法读取模型数据：',
        empty: '没有找到已配置的模型。',
        providerFailed: '该提供商无法列出模型：',
        notMeasured: '未测速',
        ttft: '首字',
        samples: '次采样',
        footer: '速度 = 输出 token 数 ÷ 解码时长（首字到消息落盘）。数值按 实际/测速 顺序显示；分布来自保留的真实流量样本；Δ 为探测相对实际流量的差值；探测短于 8 token 或 20 ms 时标记为样本过短，不显示速度。Host 重启后重新采样。',
        busyHint: '测速会向该模型发送一次极短请求，可能消耗少量额度。',
        justNow: '刚刚',
        minutesAgo: '分钟前',
        hoursAgo: '小时前',
        daysAgo: '天前',
        failed: '测速失败：',
        errTimeout: '超时，请稍后重试或检查提供商',
        errArrears: '账户欠费或余额不足',
        errAuth: '鉴权被拒绝，请检查密钥',
        errRateLimit: '触发限流，请稍后重试',
        errNetwork: '本地网络故障，请检查网络或代理',
        errServer: '提供商服务器故障，请稍后重试',
        errRoute: '该模型没有可用路由',
        errEmpty: '模型没有输出',
        errAborted: '请求被中断',
        errUnknown: '原因未知',
        usageTitle: '用量统计',
        usageDay: '今日',
        usageWeek: '本周',
        usageMonth: '本月',
        usageLoading: '正在读取用量…',
        usageFailed: '用量读取失败',
        tagBench: '测速',
        tagLive: '实际',
        collapse: '收起',
        expand: '展开',
        measured: '已测速',
        p50: 'p50',
        delta: 'Δ',
        shortSample: '样本过短',
        statusOk: '测速成功',
        statusError: '测速失败',
      },
      ja: {
        title: 'モデル速度',
        description: 'このプロファイルで設定済みのモデルの生成速度（tok/s）を表示します。実際の会話サンプルとオンデマンドのベンチマークに基づきます。',
        measure: 'ベンチマーク',
        measuring: 'ベンチマーク中…',
        measureAll: 'すべてベンチマーク',
        measuringAll: 'ベンチマーク中',
        refresh: '更新',
        retry: '再試行',
        loading: '設定済みモデルを読み込み中…',
        loadFailed: 'モデルデータを読み込めませんでした：',
        empty: '設定済みモデルが見つかりません。',
        providerFailed: 'このプロバイダーはモデルを一覧表示できませんでした：',
        notMeasured: '未測定',
        ttft: 'TTFT',
        samples: 'サンプル',
        footer: '速度＝出力トークン数÷デコード時間（最初のトークンからメッセージ確定まで）。ペアの速度はライブ/ベンチマークの順です。分布は保持されたライブサンプルに基づきます。Δ はライブに対するベンチマークの差です。8 トークンまたは 20 ms 未満のプローブはサンプル不足として扱い、速度を表示しません。Host の再起動でサンプルはリセットされます。',
        busyHint: 'ベンチマークはモデルへ非常に短いリクエストを 1 回送信し、少量のクォータを消費する場合があります。',
        justNow: 'たった今',
        minutesAgo: '分前',
        hoursAgo: '時間前',
        daysAgo: '日前',
        failed: 'ベンチマーク失敗：',
        errTimeout: 'タイムアウトしました。後で再試行するかプロバイダーを確認してください',
        errArrears: 'アカウントが未払い、または残高不足です',
        errAuth: '認証が拒否されました。API キーを確認してください',
        errRateLimit: 'レート制限中です。後で再試行してください',
        errNetwork: 'ローカルネットワーク障害です。接続またはプロキシを確認してください',
        errServer: 'プロバイダーのサーバー障害です。後で再試行してください',
        errRoute: 'このモデルへのルートがありません',
        errEmpty: 'モデルが出力を返しませんでした',
        errAborted: 'リクエストが中断されました',
        errUnknown: '原因不明',
        usageTitle: '使用量',
        usageDay: '今日',
        usageWeek: '今週',
        usageMonth: '今月',
        usageLoading: '使用量を読み込み中…',
        usageFailed: '使用量を取得できません',
        tagBench: 'ベンチ',
        tagLive: 'ライブ',
        collapse: '折りたたむ',
        expand: '展開',
        measured: '測定済み',
        p50: 'p50',
        delta: 'Δ',
        shortSample: 'サンプル不足',
        statusOk: 'ベンチマーク成功',
        statusError: 'ベンチマーク失敗',
      },
    }

    const S = {
      page: {
        boxSizing: 'border-box',
        padding: '20px 24px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 880,
        color: 'var(--dsw-alias-label-primary)',
      },
      header: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      },
      heading: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
      title: { margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.3 },
      desc: {
        margin: 0,
        fontSize: 12.5,
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: 620,
      },
      toolbar: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      button: {
        font: 'inherit',
        fontSize: 12.5,
        lineHeight: 1.2,
        padding: '6px 12px',
        borderRadius: 7,
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        whiteSpace: 'nowrap',
      },
      primaryButton: {
        font: 'inherit',
        fontSize: 12.5,
        lineHeight: 1.2,
        padding: '6px 12px',
        borderRadius: 7,
        cursor: 'pointer',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-bg-base)',
        whiteSpace: 'nowrap',
      },
      buttonBusy: { opacity: 0.65, cursor: 'default' },
      groups: { display: 'flex', flexDirection: 'column', gap: 12 },
      group: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      groupHead: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        padding: '9px 14px',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      groupName: { fontSize: 12.5, fontWeight: 600 },
      groupId: {
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      groupCount: {
        marginLeft: 'auto',
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        fontVariantNumeric: 'tabular-nums',
      },
      groupError: {
        margin: 0,
        padding: '9px 14px',
        fontSize: 12,
        color: 'var(--dsw-alias-state-error-primary)',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        flexWrap: 'wrap',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      rowFirst: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        flexWrap: 'wrap',
      },
      nameCell: { flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
      nameLine: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
      dotOk: {
        flex: '0 0 auto',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--dsw-alias-state-success-primary)',
      },
      dotError: {
        flex: '0 0 auto',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--dsw-alias-state-error-primary)',
      },
      modelName: {
        fontSize: 13,
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      },
      modelId: {
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      speedCell: {
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
        minWidth: 104,
      },
      speedValue: {
        fontSize: 18,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      },
      speedUnit: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      speedMuted: { fontSize: 18, color: 'var(--dsw-alias-label-secondary)' },
      metaLine: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      rowError: { color: 'var(--dsw-alias-state-error-primary)', whiteSpace: 'normal' },
      rowButton: {
        flex: '0 0 auto',
        font: 'inherit',
        fontSize: 12,
        lineHeight: 1.2,
        padding: '5px 11px',
        borderRadius: 7,
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        whiteSpace: 'nowrap',
      },
      muted: { margin: 0, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      error: { margin: 0, fontSize: 12.5, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5 },
      notice: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      footer: {
        margin: 0,
        fontSize: 11.5,
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-secondary)',
      },
      // The input.dock anchor is display:contents, so this root is a direct
      // flex child of the composer stack; order 1 puts the panel after the
      // composer card, making it the bottommost row.
      dock: {
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 'var(--dsh-composer-card-max-width)',
        margin: '0 auto',
        order: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '7px 10px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
      },
      dockHeader: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
      dockTitle: { fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
      dockSummary: {
        fontSize: 11,
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      dockActions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 },
      dockBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        maxHeight: 190,
        overflowY: 'auto',
        paddingTop: 2,
      },
      dockGroup: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
      dockProvider: {
        flex: '0 0 auto',
        width: 96,
        fontSize: 10.5,
        color: 'var(--dsw-alias-label-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      dockModels: { display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 },
      dockChip: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 6px',
        borderRadius: 7,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        minWidth: 0,
      },
      dockChipName: {
        fontSize: 11,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 150,
      },
      dockChipSpeed: { display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' },
      dockChipValue: { fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
      dockChipUnit: { fontSize: 9.5, color: 'var(--dsw-alias-label-secondary)' },
      distLine: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
      usagePopover: {
        position: 'fixed',
        zIndex: 60,
        minWidth: 236,
        padding: '8px 10px',
        borderRadius: 14,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      },
      usageHeader: { fontSize: 11, fontWeight: 600, marginBottom: 2 },
      usageRow: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
      },
      usagePeriod: {
        flex: '0 0 auto',
        width: 34,
        color: 'var(--dsw-alias-label-secondary)',
      },
      usageValue: { color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' },
      usageLine: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      usageErrorLine: {
        marginTop: 2,
        paddingTop: 4,
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 10.5,
        color: 'var(--dsw-alias-state-error-primary)',
      },
      dockMuted: {
        fontSize: 10.5,
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 240,
      },
      dockError: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.4 },
      dockButton: {
        font: 'inherit',
        fontSize: 10.5,
        lineHeight: 1.2,
        padding: '2px 6px',
        borderRadius: 5,
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        whiteSpace: 'nowrap',
      },
    }

    function messageOf(error) {
      if (error === undefined || error === null) return 'unknown error'
      if (typeof error === 'string') return error
      if (typeof error === 'object' && typeof error.message === 'string' && error.message !== '') return error.message
      try {
        return String(error)
      } catch {
        return 'unknown error'
      }
    }

    function rowKey(provider, model) {
      return `${provider}\u0000${model}`
    }

    function formatSpeed(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return value >= 100 ? String(Math.round(value)) : value.toFixed(1)
    }

    /** Compact token counts: 1.2k, 34k, 1.1M. */
    function formatTokens(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0'
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
      if (value >= 100_000) return `${Math.round(value / 1_000)}k`
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
      return String(Math.round(value))
    }

    function formatAgo(at, t) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      const diff = Math.max(0, Date.now() - at)
      if (diff < 60_000) return t('justNow')
      if (diff < 3_600_000) return `${Math.round(diff / 60_000)} ${t('minutesAgo')}`
      if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} ${t('hoursAgo')}`
      return `${Math.round(diff / 86_400_000)} ${t('daysAgo')}`
    }

    /** Tiny sparkline of recent real samples, oldest on the left. */
    function Sparkline(props) {
      const values = Array.isArray(props.values)
        ? props.values.filter((value) => typeof value === 'number' && Number.isFinite(value))
        : []
      if (values.length < 2) return null
      const width = 64
      const height = 16
      const pad = 2
      const min = Math.min(...values)
      const max = Math.max(...values)
      const span = Math.max(1, max - min)
      const points = values.map((value, index) => {
        const x = pad + (index / (values.length - 1)) * (width - pad * 2)
        const y = height - pad - ((value - min) / span) * (height - pad * 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      }).join(' ')
      return h('svg', {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        'aria-hidden': true,
        style: { flex: '0 0 auto', color: 'var(--dsw-alias-label-secondary)' },
      }, h('polyline', {
        points,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      }))
    }

    function findEntry(measurements, provider, model) {
      if (!Array.isArray(measurements)) return undefined
      return measurements.find((entry) => entry && entry.provider === provider && entry.model === model)
    }

    function mainOf(entry) {
      if (!entry) return null
      if (entry.observed) return { ...entry.observed, kind: 'observed' }
      if (entry.benchmark) return { ...entry.benchmark, kind: 'benchmark' }
      return null
    }

    function probeOf(entry) {
      return entry && entry.benchmark ? entry.benchmark : null
    }

    function usableProbeOf(entry) {
      const probe = probeOf(entry)
      return probe && probe.shortSample !== true ? probe : null
    }

    function deltaOf(entry) {
      const probe = usableProbeOf(entry)
      if (!entry || !entry.observed || !probe) return null
      const live = entry.observed.tps
      const measured = probe.tps
      if (typeof live !== 'number' || !Number.isFinite(live) || live <= 0) return null
      if (typeof measured !== 'number' || !Number.isFinite(measured)) return null
      const percent = ((measured - live) / live) * 100
      const rounded = Math.round(Math.abs(percent))
      return { text: `${percent >= 0 ? '+' : '−'}${rounded < 1 ? '0' : String(rounded)}%` }
    }

    function distributionText(observed, t) {
      const stats = observed && observed.stats
      if (!stats || typeof stats.p50 !== 'number') return ''
      const range = stats.min === stats.max ? '' : ` · ${formatSpeed(stats.min)}–${formatSpeed(stats.max)}`
      return `${t('p50')} ${formatSpeed(stats.p50)}${range} · ${stats.window} ${t('samples')}`
    }

    /** Live/benchmark pair, in the order the dock legend promises. */
    function pairSpeed(observed, probe, main) {
      if (observed && probe) return `${formatSpeed(observed.tps)}/${formatSpeed(probe.tps)}`
      return formatSpeed(main ? main.tps : null)
    }

    function statusOf(entry, rowError) {
      if (rowError) return 'error'
      if (entry && entry.lastError) return 'error'
      if (entry && entry.benchmark && entry.benchmark.shortSample !== true) return 'ok'
      return null
    }

    const FAILURE_KEYS = {
      timeout: 'errTimeout',
      arrears: 'errArrears',
      auth: 'errAuth',
      rateLimit: 'errRateLimit',
      network: 'errNetwork',
      server: 'errServer',
      route: 'errRoute',
      empty: 'errEmpty',
      aborted: 'errAborted',
    }

    /** Locale text for one failure category; raw provider detail stays out of it. */
    function failureText(result, t) {
      const kind = result && typeof result.kind === 'string' ? result.kind : ''
      return `${t('failed')}${t(FAILURE_KEYS[kind] ?? 'errUnknown')}`
    }

    /** Raw provider detail, kept for the tooltip only. */
    function detailOf(entry) {
      const raw = entry && entry.lastError && typeof entry.lastError.error === 'string' ? entry.lastError.error : ''
      return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw
    }

    function problemOf(entry, rowError, t) {
      if (rowError) return rowError
      if (entry && entry.lastError) return failureText(entry.lastError, t)
      return ''
    }

    const COLLAPSED_KEY = 'dsh.model-speed.dock-collapsed'

    function readCollapsed() {
      try {
        return window.localStorage.getItem(COLLAPSED_KEY) === '1'
      } catch {
        return false
      }
    }

    function writeCollapsed(value) {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
      } catch {
        // Browsers that refuse storage keep the session-only default.
      }
    }

    async function requestState() {
      const response = await fetch(STATE_URL, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok) throw new Error((data && data.error) || `HTTP ${response.status}`)
      return data
    }

    async function requestMeasure(provider, model) {
      const response = await fetch(MEASURE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ provider, model }),
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok) throw new Error((data && data.error) || `HTTP ${response.status}`)
      return data
    }

    async function requestUsage(provider, model) {
      const params = new URLSearchParams({ provider, model })
      const response = await fetch(`${USAGE_URL}?${params.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok) throw new Error((data && data.error) || `HTTP ${response.status}`)
      return data
    }

    function ModelSpeedIcon(props) {
      const size = typeof props.size === 'number' && Number.isFinite(props.size) ? props.size : 16
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
        style: {
          display: 'block',
          color: props.active
            ? 'var(--dsw-alias-label-primary)'
            : 'var(--dsw-alias-label-secondary)',
        },
      },
      h('path', {
        d: 'M2.6 11.6a6 6 0 1 1 10.8 0',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M8 9.5l2.9-2.6',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
      }),
      h('circle', { cx: 8, cy: 9.7, r: 1.1, fill: 'currentColor' }))
    }

    function ModelSpeedSection(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [collapsed, setCollapsed] = React.useState(readCollapsed)
      const [state, setState] = React.useState({
        status: 'loading',
        providers: [],
        measurements: [],
        error: '',
      })
      const [busyKey, setBusyKey] = React.useState(null)
      const [progress, setProgress] = React.useState(null)
      const [rowErrors, setRowErrors] = React.useState({})
      const [usagePopup, setUsagePopup] = React.useState(null)
      const usageCache = React.useRef(new Map())

      const applyState = (data) => {
        setState({
          status: 'ready',
          providers: Array.isArray(data && data.providers) ? data.providers : [],
          measurements: Array.isArray(data && data.measurements) ? data.measurements : [],
          error: '',
        })
      }

      const refresh = async () => {
        try {
          applyState(await requestState())
        } catch (error) {
          setState((current) => ({
            ...current,
            status: current.status === 'ready' ? 'ready' : 'error',
            error: messageOf(error),
          }))
        }
      }

      React.useEffect(() => {
        let alive = true
        const pull = async () => {
          try {
            const data = await requestState()
            if (alive) applyState(data)
          } catch (error) {
            if (!alive) return
            setState((current) => ({
              ...current,
              status: current.status === 'ready' ? 'ready' : 'error',
              error: messageOf(error),
            }))
          }
        }
        void pull()
        const timer = setInterval(pull, 12_000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])

      // The usage card lives on document.body so no ancestor stacking context or
      // overflow can hide it behind the composer card.
      React.useEffect(() => {
        if (!usagePopup || typeof document === 'undefined') return undefined
        const card = document.createElement('div')
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-label', t('usageTitle'))
        Object.assign(card.style, S.usagePopover)
        card.style.borderRadius = '14px'
        card.style.zIndex = '2147483000'
        const rect = usagePopup.rect
        const viewport = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1200
        card.style.left = `${Math.max(8, Math.min(rect.left, viewport - 320))}px`
        if (rect.top > 140) {
          card.style.top = `${rect.top - 6}px`
          card.style.transform = 'translateY(-100%)'
        } else {
          card.style.top = `${rect.bottom + 6}px`
        }
        const addLine = (text, style) => {
          const line = document.createElement('div')
          Object.assign(line.style, style)
          line.textContent = text
          card.appendChild(line)
        }
        addLine(t('usageTitle'), S.usageHeader)
        if (usagePopup.status === 'loading') {
          addLine(t('usageLoading'), S.usageLine)
        } else if (usagePopup.status === 'error') {
          addLine(t('usageFailed'), S.usageLine)
        } else {
          for (const [period, label] of [['day', 'usageDay'], ['week', 'usageWeek'], ['month', 'usageMonth']]) {
            const real = (usagePopup.data && usagePopup.data.real && usagePopup.data.real[period]) || { input: 0, output: 0 }
            const bench = (usagePopup.data && usagePopup.data.bench && usagePopup.data.bench[period]) || { calls: 0, tokens: 0 }
            const row = document.createElement('div')
            Object.assign(row.style, S.usageRow)
            const periodCell = document.createElement('span')
            Object.assign(periodCell.style, S.usagePeriod)
            periodCell.textContent = t(label)
            const valueCell = document.createElement('span')
            Object.assign(valueCell.style, S.usageValue)
            valueCell.textContent = formatTokens(real.input + real.output + bench.tokens)
            row.appendChild(periodCell)
            row.appendChild(valueCell)
            card.appendChild(row)
          }
        }
        const entry = findEntry(state.measurements, usagePopup.group.id, usagePopup.model.id)
        if (entry && entry.lastError) {
          addLine(failureText(entry.lastError, t), S.usageErrorLine)
        }
        document.body.appendChild(card)
        return () => {
          card.remove()
        }
      }, [usagePopup, state.measurements, t])

      const setRowError = (key, message) => {
        setRowErrors((current) => ({ ...current, [key]: message }))
      }

      const clearRowError = (key) => {
        setRowErrors((current) => {
          if (!(key in current)) return current
          const next = { ...current }
          delete next[key]
          return next
        })
      }

      const hideUsage = () => setUsagePopup(null)

      const showUsage = (group, model, element) => {
        if (!element || typeof element.getBoundingClientRect !== 'function') return
        const key = rowKey(group.id, model.id)
        const rect = element.getBoundingClientRect()
        const cached = usageCache.current.get(key)
        if (cached !== undefined && Date.now() - cached.at < 60_000) {
          setUsagePopup({ key, group, model, rect, status: 'ready', data: cached.data })
          return
        }
        setUsagePopup({ key, group, model, rect, status: 'loading', data: null })
        requestUsage(group.id, model.id).then((data) => {
          usageCache.current.set(key, { at: Date.now(), data })
          setUsagePopup((current) => (current !== null && current.key === key ? { ...current, status: 'ready', data } : current))
        }).catch(() => {
          setUsagePopup((current) => (current !== null && current.key === key ? { ...current, status: 'error' } : current))
        })
      }

      const measureAll = async () => {
        const rows = []
        for (const group of state.providers) {
          for (const model of group.models) rows.push([group.id, model.id])
        }
        if (rows.length === 0) return
        setBusyKey('all')
        setProgress({ done: 0, total: rows.length })
        try {
          for (let index = 0; index < rows.length; index += 1) {
            const [provider, model] = rows[index]
            const key = rowKey(provider, model)
            clearRowError(key)
            try {
              const data = await requestMeasure(provider, model)
              if (!data || data.ok !== true) setRowError(key, failureText(data, t))
            } catch (error) {
              setRowError(key, `${t('failed')}${messageOf(error)}`)
            }
            setProgress({ done: index + 1, total: rows.length })
          }
          await refresh()
        } finally {
          setBusyKey(null)
          setProgress(null)
        }
      }

      const groups = state.providers.filter(
        (group) => group && ((Array.isArray(group.models) && group.models.length > 0) || group.error),
      )
      const modelCount = groups.reduce(
        (total, group) => total + (Array.isArray(group.models) ? group.models.length : 0),
        0,
      )
      const anyBusy = busyKey !== null
      const progressText = busyKey === 'all' && progress ? `${progress.done}/${progress.total}` : ''

      if (props.compact) {
        const measuredCount = groups.reduce((total, group) => {
          const models = Array.isArray(group.models) ? group.models : []
          return total + models.filter((model) => mainOf(findEntry(state.measurements, group.id, model.id)) !== null).length
        }, 0)
        const summary = busyKey === 'all' && progress
          ? `${t('measuringAll')} ${progress.done}/${progress.total}`
          : state.status === 'loading'
            ? t('loading')
            : measuredCount === 0
              ? t('notMeasured')
              : `${measuredCount}/${modelCount} ${t('measured')} ${t('tagLive')}/${t('tagBench')}`
        const toggle = () => {
          setCollapsed((current) => {
            const next = !current
            writeCollapsed(next)
            return next
          })
        }
        return h('section', { style: S.dock },
          h('div', { style: S.dockHeader },
            h('span', { style: S.dockTitle }, t('title')),
            h('span', { style: S.dockSummary }, summary),
            h('div', { style: S.dockActions },
              h('button', {
                type: 'button',
                style: anyBusy ? { ...S.dockButton, ...S.buttonBusy } : S.dockButton,
                disabled: anyBusy || modelCount === 0,
                title: t('busyHint'),
                onClick: () => { void measureAll() },
              }, t('measure')),
              h('button', {
                type: 'button',
                style: S.dockButton,
                onClick: toggle,
                'aria-expanded': collapsed ? 'false' : 'true',
                'aria-label': collapsed ? t('expand') : t('collapse'),
              }, collapsed ? '▸' : '▾'))),
          collapsed
            ? null
            : h('div', { style: S.dockBody },
                state.status === 'error'
                  ? h('span', { style: S.dockError }, `${t('loadFailed')}${state.error}`)
                  : state.status === 'loading'
                    ? h('span', { style: S.dockMuted }, t('loading'))
                    : groups.length === 0
                      ? h('span', { style: S.dockMuted }, t('empty'))
                      : h('div', { style: S.dockModels },
                          groups.flatMap((group) => (Array.isArray(group.models) ? group.models : []).map((model) => {
                            const entry = findEntry(state.measurements, group.id, model.id)
                            const main = mainOf(entry)
                            const observed = entry && entry.observed ? entry.observed : null
                            const probe = usableProbeOf(entry)
                            const shortMain = main !== null && main.shortSample === true
                            const key = rowKey(group.id, model.id)
                            const rowError = rowErrors[key]
                            const status = statusOf(entry, rowError)
                            const problem = problemOf(entry, rowError, t)
                            return h('div', {
                              key,
                              style: S.dockChip,
                              onMouseEnter: (event) => showUsage(group, model, event.currentTarget),
                              onMouseLeave: hideUsage,
                            },
                            status
                              ? h('span', {
                                  style: status === 'ok' ? S.dotOk : S.dotError,
                                  role: 'img',
                                  'aria-label': status === 'ok' ? t('statusOk') : t('statusError'),
                                })
                              : null,
                            h('span', { style: S.dockChipName }, model.name || model.id),
                            main && !shortMain
                              ? h('span', { style: S.dockChipSpeed },
                                  h('b', { style: S.dockChipValue }, pairSpeed(observed, probe, main)),
                                  h('span', { style: S.dockChipUnit }, ' tok/s'))
                              : h('span', { style: S.dockMuted }, problem || (shortMain ? t('shortSample') : t('notMeasured'))))
                          })))
                ))
      }

      const renderRow = (group, model, index) => {
        const entry = findEntry(state.measurements, group.id, model.id)
        const main = mainOf(entry)
        const observed = entry && entry.observed ? entry.observed : null
        const rawProbe = probeOf(entry)
        const probe = usableProbeOf(entry)
        const delta = deltaOf(entry)
        const shortMain = main !== null && main.shortSample === true
        const key = rowKey(group.id, model.id)
        const rowError = rowErrors[key]
        const status = statusOf(entry, rowError)
        const problem = problemOf(entry, rowError, t)
        const meta = main
          ? [
              typeof main.ttftMs === 'number' ? `${t('ttft')} ${Math.round(main.ttftMs)} ms` : '',
              formatAgo(main.at, t),
            ].filter(Boolean).join(' · ')
          : ''
        const distText = observed ? distributionText(observed, t) : ''
        const probeLine = probe && observed
          ? [delta ? `${t('delta')}${delta.text}` : '', formatAgo(probe.at, t)].filter(Boolean).join(' · ')
          : ''
        const shortNote = rawProbe && rawProbe.shortSample === true
          ? `${t('shortSample')} · ${rawProbe.tokens} tokens · ${rawProbe.decodeMs} ms`
          : ''
        return h('div', { key: model.id, style: index === 0 ? S.rowFirst : S.row },
          h('div', { style: S.nameCell },
            h('div', { style: S.nameLine },
              status
                ? h('span', {
                    style: status === 'ok' ? S.dotOk : S.dotError,
                    role: 'img',
                    'aria-label': status === 'ok' ? t('statusOk') : t('statusError'),
                  })
                : null,
              h('span', { style: S.modelName, title: model.id }, model.name || model.id))),
          h('div', { style: S.speedCell },
            main && !shortMain
              ? h('span', { style: S.speedValue }, pairSpeed(observed, probe, main))
              : h('span', { style: S.speedMuted }, shortMain ? t('shortSample') : '—'),
            main && !shortMain ? h('span', { style: S.speedUnit }, 'tok/s') : null),
          h('div', { style: S.metaCell },
            problem
              ? h('span', { style: S.rowError, title: detailOf(entry) || undefined }, problem)
              : h('span', { style: S.metaLine }, main ? meta : t('notMeasured')),
            distText
              ? h('div', { style: S.distLine },
                  h('span', { style: S.metaLine, title: distText }, distText),
                  observed && observed.stats && Array.isArray(observed.stats.spark)
                    ? h(Sparkline, { values: observed.stats.spark })
                    : null)
              : null,
            probeLine ? h('span', { style: S.metaLine }, probeLine) : null,
            shortNote ? h('span', { style: S.metaLine }, shortNote) : null))
      }

      return h('section', { style: S.page },
        h('div', { style: S.header },
          h('div', { style: S.heading },
            h('h2', { style: S.title }, t('title')),
            h('p', { style: S.desc }, t('description'))),
          h('div', { style: S.toolbar },
            h('button', {
              type: 'button',
              style: anyBusy ? { ...S.primaryButton, ...S.buttonBusy } : S.primaryButton,
              disabled: anyBusy || modelCount === 0,
              onClick: () => { void measureAll() },
            }, t('measure')),
            progressText ? h('span', { style: S.muted }, progressText) : null,
            h('button', {
              type: 'button',
              style: anyBusy ? { ...S.button, ...S.buttonBusy } : S.button,
              disabled: anyBusy,
              onClick: () => { void refresh() },
            }, t('refresh')))),
        state.status === 'loading'
          ? h('p', { style: S.muted, role: 'status' }, t('loading'))
          : null,
        state.status === 'error'
          ? h('div', { style: S.notice, role: 'alert' },
              h('p', { style: S.error }, `${t('loadFailed')}${state.error}`),
              h('button', {
                type: 'button',
                style: S.button,
                onClick: () => { void refresh() },
              }, t('retry')))
          : null,
        state.status === 'ready' && state.error
          ? h('p', { style: S.error }, `${t('loadFailed')}${state.error}`)
          : null,
        state.status === 'ready' && groups.length === 0
          ? h('p', { style: S.muted }, t('empty'))
          : null,
        groups.length > 0
          ? h('div', { style: S.groups }, groups.map((group) => h('section', { key: group.id, style: S.group },
              h('div', { style: S.groupHead },
                h('span', { style: S.groupName, title: group.id }, group.name || group.id),
                h('span', { style: S.groupCount }, `${Array.isArray(group.models) ? group.models.length : 0}`)),
              group.error
                ? h('p', { style: S.groupError, role: 'alert' }, `${t('providerFailed')}${group.error}`)
                : null,
              Array.isArray(group.models)
                ? group.models.map((model, index) => renderRow(group, model, index))
                : null)))
          : null,
        h('p', { style: S.footer }, `${t('busyHint')} ${t('footer')}`))
    }

    function ModelSpeedDock(props) {
      return h(ModelSpeedSection, { t: props.t, compact: true })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'model-speed: dictionaries')
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'model-speed',
          order: 61,
          label: () => t('title'),
          locale: NS,
        }, ModelSpeedSection))
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: 'model-speed',
          order: 61,
        }, ModelSpeedIcon))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'model-speed',
          order: 100,
          locale: NS,
        }, ModelSpeedDock))
      },
    }
  },
})
