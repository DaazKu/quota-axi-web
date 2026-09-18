// Entirely synthetic. Never replace this with captured provider output.
export function sampleReport(now = new Date().toISOString()) {
  return {
    schemaVersion: 5, generatedAt: now,
    providers: [
      { provider: 'claude', windows: [
        { id: 'session', label: 'Session · 5 hours', percentRemaining: 72, resetsAt: new Date(Date.parse(now) + 2 * 60 * 60 * 1000).toISOString() },
        { id: 'week', label: 'Weekly allowance', percentRemaining: 43.5, resetsAt: new Date(Date.parse(now) + 4 * 24 * 60 * 60 * 1000).toISOString() },
      ], state: { status: 'fresh', stale: false } },
      { provider: 'codex', windows: [
        { id: 'session', label: 'Session · 5 hours', percentRemaining: 0, resetsAt: new Date(Date.parse(now) + 60 * 60 * 1000).toISOString() },
        { id: 'week', label: 'Weekly allowance', percentRemaining: 88, resetText: 'Later this week' },
      ], state: { status: 'fresh', stale: false } },
      { provider: 'cursor', windows: [{ id: 'month', label: 'Monthly usage', percentRemaining: 68, spentUsd: 16, limitUsd: 50 }], state: { status: 'stale', stale: true } },
      { provider: 'copilot', windows: [], state: { status: 'auth_required', stale: false } },
      { provider: 'grok', windows: [{ id: 'unknown', label: 'Model allowance' }], quotaSemantics: { status: 'unknown' }, state: { status: 'fresh', stale: false } },
      { provider: 'kimi', windows: [], state: { status: 'error', stale: false, error: 'Synthetic private diagnostic omitted by viewer' } },
    ],
  };
}
