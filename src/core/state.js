import fs from 'node:fs';

export function loadState(cfg) {
  if (!fs.existsSync(cfg.stateFile)) {
    return { phases: { '1': { done: [], fail: [] }, '2': { done: [], fail: [] }, both: { done: [], fail: [] } } };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf-8'));
    parsed.phases ??= { '1': { done: [], fail: [] }, '2': { done: [], fail: [] }, both: { done: [], fail: [] } };
    parsed.phases['1'] ??= { done: [], fail: [] };
    parsed.phases['2'] ??= { done: [], fail: [] };
    parsed.phases.both ??= { done: [], fail: [] };
    return parsed;
  } catch {
    return { phases: { '1': { done: [], fail: [] }, '2': { done: [], fail: [] }, both: { done: [], fail: [] } } };
  }
}

export function saveState(cfg, state) {
  fs.writeFileSync(cfg.stateFile, JSON.stringify(state, null, 2));
}

export function markDone(cfg, state, phase, dealId) {
  state.phases ??= {};
  state.phases[phase] ??= { done: [], fail: [] };

  if (!state.phases[phase].done.includes(dealId)) {
    state.phases[phase].done.push(dealId);
  }

  // Keep file from growing infinitely
  if (state.phases[phase].done.length > 250000) {
    state.phases[phase].done = state.phases[phase].done.slice(-200000);
  }

  saveState(cfg, state);
}

export function markFail(cfg, state, phase, dealId, err) {
  state.phases ??= {};
  state.phases[phase] ??= { done: [], fail: [] };

  state.phases[phase].fail.push({
    ts: new Date().toISOString(),
    id: dealId,
    error: String(err?.message || err),
  });

  saveState(cfg, state);
}
