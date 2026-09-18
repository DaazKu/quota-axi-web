const statuses = new Set(['fresh', 'stale', 'unavailable', 'auth_required', 'rate_limited', 'error']);
const invalid = () => { throw new Error('Invalid quota report. Expected schema 5 provider data.'); };
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.length <= 500;
const date = (v) => text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

function optional(target, source, key, valid) {
  if (source[key] === undefined) return;
  if (!valid(source[key])) invalid();
  target[key] = source[key];
}

/** Validate and allowlist. Never forward account, attempts, raw errors or commands. */
export function parseReport(raw) {
  let input;
  try { input = JSON.parse(raw); } catch { throw new Error('quota-axi returned invalid JSON.'); }
  if (!object(input)) invalid();
  if (input.schemaVersion !== 5) throw new Error('Unsupported quota schema. This viewer supports schemaVersion 5.');
  if (!date(input.generatedAt) || !Array.isArray(input.providers) || input.providers.length > 100) invalid();
  return {
    generatedAt: input.generatedAt,
    providers: input.providers.map((p) => {
      if (!object(p) || !text(p.provider) || !p.provider || !object(p.state)
        || !statuses.has(p.state.status) || typeof p.state.stale !== 'boolean'
        || !Array.isArray(p.windows) || p.windows.length > 100) invalid();
      const state = { status: p.state.status, stale: p.state.stale };
      optional(state, p.state, 'refreshedAt', date);
      optional(state, p.state, 'retryAfter', date);
      state.degraded = Array.isArray(p.state.degradedSources) && p.state.degradedSources.length > 0;
      const untrusted = p.state.untrustedWindowIds;
      if (untrusted !== undefined && (!Array.isArray(untrusted) || !untrusted.every(text))) invalid();
      const windows = p.windows.map((w) => {
        if (!object(w) || !text(w.id) || !text(w.label)) invalid();
        const window = { label: w.label, untrusted: untrusted?.includes(w.id) ?? false };
        for (const key of ['percentRemaining', 'percentUsed']) {
          optional(window, w, key, (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);
        }
        for (const key of ['spentUsd', 'limitUsd']) {
          optional(window, w, key, (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
        }
        optional(window, w, 'resetsAt', date);
        optional(window, w, 'resetText', text);
        return window;
      });
      const provider = { provider: p.provider, state, windows };
      if (p.quotaSemantics !== undefined) {
        if (!object(p.quotaSemantics) || !['known', 'partial', 'unknown'].includes(p.quotaSemantics.status)) invalid();
        provider.semantics = p.quotaSemantics.status;
      }
      if (p.credits !== undefined) {
        if (!object(p.credits)) invalid();
        provider.credits = {};
        optional(provider.credits, p.credits, 'remaining', (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
        optional(provider.credits, p.credits, 'unlimited', (v) => typeof v === 'boolean');
        optional(provider.credits, p.credits, 'unit', (v) => ['usd', 'credits'].includes(v));
      }
      return provider;
    }),
  };
}
