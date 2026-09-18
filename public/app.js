const names = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok', kimi: 'Kimi', zai: 'Z.ai', agy: 'Antigravity', alibaba: 'Alibaba', 'opencode-go': 'OpenCode Go' };
const statusNames = { fresh: 'Fresh', stale: 'Stale', unavailable: 'Unavailable', auth_required: 'Authentication needed', rate_limited: 'Rate limited', error: 'Provider error' };
const statusNotes = {
  stale: 'Cached reading. Current capacity may differ.',
  unavailable: 'No quota reading available from this provider.',
  auth_required: 'Check authentication in your provider CLI. This viewer cannot sign you in.',
  rate_limited: 'Provider requests are paused to respect its rate limit.',
  error: 'The provider could not return a fresh reading. Check quota-axi locally for details.',
};
const formatDate = (date) => new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const number = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function quotaWindow(w, stale) {
  const row = el('div', 'window');
  row.append(el('h3', '', w.label));
  const remaining = w.percentRemaining;
  const used = w.percentUsed;
  const value = remaining ?? used;
  const caption = remaining !== undefined ? 'remaining' : used !== undefined ? 'used' : 'quota unknown';
  const reading = el('p', 'reading');
  reading.append(el('strong', '', value === undefined ? 'Unknown' : `${number(value)}%`), el('span', '', value === undefined ? 'Not reported' : caption));
  row.append(reading);
  if (value !== undefined) {
    const meter = el('meter', stale || w.untrusted ? 'uncertain' : '');
    meter.min = 0; meter.max = 100; meter.value = value;
    meter.setAttribute('aria-label', `${w.label}: ${number(value)}% ${caption}${stale ? ' (stale)' : ''}${w.untrusted ? ' (untrusted)' : ''}`);
    row.append(meter);
  }
  if (w.spentUsd !== undefined || w.limitUsd !== undefined) {
    row.append(el('p', 'detail', `${w.spentUsd !== undefined ? `$${number(w.spentUsd)} spent` : 'Spend unknown'} · ${w.limitUsd !== undefined ? `$${number(w.limitUsd)} limit` : 'Limit unknown'}`));
  }
  row.append(el('p', 'detail', w.resetsAt ? `Resets ${formatDate(w.resetsAt)}` : w.resetText || 'Reset not reported'));
  if (w.untrusted) row.append(el('p', 'warning', 'Untrusted window: do not rely on this reading.'));
  return row;
}

export function render(data) {
  const grid = document.querySelector('#providers');
  grid.replaceChildren();
  const report = data.report;
  document.querySelector('#updated').textContent = data.updatedAt ? `Last acquired ${formatDate(data.updatedAt)}` : 'No successful acquisition yet';
  document.querySelector('#schedule').textContent = `Next provider check no earlier than ${formatDate(data.nextRefreshAt)}`;
  const notice = document.querySelector('#notice');
  notice.className = data.error || data.stale ? 'notice warning' : 'notice';
  notice.textContent = data.error
    ? `Acquisition failed: ${data.error}${report ? ' Showing the last report, now stale.' : ''}`
    : data.stale ? 'Stale report. These readings may no longer reflect current capacity.'
      : report?.providers.length ? 'Automatic refresh is on while this tab is visible. Manual refresh respects the same cooldown.' : 'No providers were reported. Check your local quota-axi setup.';
  if (!report) grid.append(el('div', 'empty', 'No quota report available. Keep quota-axi installed and use its CLI locally to investigate.'));
  for (const p of report?.providers ?? []) {
    const stale = data.stale || p.state.stale || p.state.status === 'stale'
      || (p.state.refreshedAt && Date.now() - Date.parse(p.state.refreshedAt) >= 5 * 60 * 1000);
    const card = el('article', 'card');
    const heading = el('div', 'card-heading');
    heading.append(el('h2', '', names[p.provider] || p.provider));
    const status = p.state.status === 'fresh' && stale ? 'stale' : p.state.status;
    heading.append(el('span', `status ${status}`, statusNames[status]));
    card.append(heading);
    if (statusNotes[status]) card.append(el('p', 'provider-note', statusNotes[status]));
    if (stale && status !== 'stale') card.append(el('p', 'warning', 'Displayed readings are stale.'));
    if (p.state.degraded) card.append(el('p', 'warning', 'Some credential sources are degraded. Check quota-axi locally.'));
    if (p.semantics && p.semantics !== 'known') card.append(el('p', 'provider-note', `Quota interpretation: ${p.semantics}. Windows may not describe every limit.`));
    for (const w of p.windows) card.append(quotaWindow(w, stale));
    if (!p.windows.length) card.append(el('p', 'unknown', 'Quota unknown'), el('p', 'detail', 'No quota windows reported.'));
    if (p.credits) {
      const credits = p.credits.unlimited ? 'Unlimited (reported)' : p.credits.remaining !== undefined ? `${number(p.credits.remaining)} ${p.credits.unit || 'units'} remaining` : 'Unknown';
      card.append(el('p', 'credits', `Credits: ${credits}`));
    }
    if (p.state.retryAfter) card.append(el('p', 'detail', `Retry after ${formatDate(p.state.retryAfter)}`));
    card.append(el('p', 'card-foot', p.state.refreshedAt ? `Provider updated ${formatDate(p.state.refreshedAt)}` : 'Provider update time unknown'));
    grid.append(card);
  }
  grid.setAttribute('aria-busy', 'false');
}

let busy = false;
let lastData;
export async function refresh() {
  if (busy) return;
  busy = true;
  const button = document.querySelector('#refresh');
  button.disabled = true;
  button.textContent = 'Checking…';
  document.querySelector('#providers').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/quota', { method: 'POST', headers: { 'X-Quota-Viewer': '1' }, cache: 'no-store', signal: AbortSignal.timeout(50_000) });
    if (!response.ok) throw new Error('Local endpoint unavailable.');
    lastData = await response.json();
    render(lastData);
  } catch {
    if (lastData) render({ ...lastData, stale: true });
    const notice = document.querySelector('#notice');
    notice.className = 'notice warning';
    notice.textContent = 'Cannot reach the local server. Is it still running? Any displayed report is stale. Retry when it is available.';
  } finally {
    button.disabled = false;
    button.textContent = 'Refresh now ↻';
    document.querySelector('#providers').setAttribute('aria-busy', 'false');
    busy = false;
  }
}

document.querySelector('#refresh').addEventListener('click', refresh);
// Cheap local checks only. The server, not the tab, decides when the CLI may run.
setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
void refresh();
