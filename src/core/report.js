import fs from 'node:fs';
import path from 'node:path';

export function ensureReportsDir(cfg) {
  if (!fs.existsSync(cfg.reportDir)) {
    fs.mkdirSync(cfg.reportDir, { recursive: true });
  }
}

export function reportJsonl(cfg, name, payload) {
  const file = path.join(cfg.reportDir, `${name}.jsonl`);
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n');
}

export function logPhaseError(cfg, phase, dealId, err) {
  const file = path.join(cfg.reportDir, `errors_phase_${phase}.log`);
  const msg = `${new Date().toISOString()} deal=${dealId} ${String(err?.message || err)}\n`;
  fs.appendFileSync(file, msg);
}
