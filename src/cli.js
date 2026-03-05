import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createOauthManager } from './rd/oauth-manager.js';
import { createHttpClient } from './rd/http-client.js';
import { createRdClient } from './rd/rd-client.js';

import { ensureReportsDir, reportJsonl, logPhaseError } from './core/report.js';
import { loadState, markDone, markFail } from './core/state.js';
import { sleep } from './core/sleep.js';
import { buildPhase1Payload, buildPhase2Payload, isMappedStage } from './config/rules.js';
import { getAppConfig } from './config/app-config.js';
import { iterateDeals } from './rd/iterate-deals.js';

function parseArgs(argv) {
	const out = {};

	for (const raw of argv) {
		if (!raw.startsWith('--')) continue;
		const [k, v] = raw.slice(2).split('=');
		out[k] = v === undefined ? true : v;
	}

	return out;
}

function toBool(v) {
	if (typeof v === 'boolean') return v;
	if (v == null) return false;
	
	return String(v).toLowerCase() === 'true';
}

export async function runCli() {
	const args = parseArgs(process.argv.slice(2));
	const cfg = getAppConfig(args);

	ensureReportsDir(cfg);

	const phase = String(args.phase || '1');
	const limit = args.limit ? Number(args.limit) : null;
	const onlyStage = args.onlyStage ? String(args.onlyStage) : null;

	console.log(`\nRD Station CRM bulk migration`);
	console.log(`- phase: ${phase}`);
	console.log(`- dry_run: ${cfg.dryRun}`);
	console.log(`- delay: ${cfg.requestDelayMs}ms`);
	console.log(`- page_size: ${cfg.pageSize}`);
	console.log(`- pagination_mode: ${cfg.paginationMode}`);
	console.log(`- verify_after_update: ${cfg.verifyAfterUpdate}\n`);

	const state = loadState(cfg);

	const oauth = createOauthManager(cfg);
	const http = createHttpClient(cfg, oauth);
	const rd = createRdClient(cfg, http);
	rd._http = http;

	// Optional: pre-load destination pipeline ids by name (more reliable for cross-pipeline moves)
	await rd.warmupPipelineCache();

	let processed = 0;

	for await (const deal of iterateDeals(cfg, rd)) {
		if (limit && processed >= limit) break;

		const dealId = deal?.id;
		const stageId = deal?.stage_id;

		if (!dealId || !stageId) continue;
		if (onlyStage && stageId !== onlyStage) continue;

		// Only deal with mapped stages to avoid touching unrelated pipelines
		if (!isMappedStage(stageId)) continue;

		if (phase === '1' || phase === '2') {
			if (state?.phases?.[phase]?.done?.includes(dealId)) continue;
		}

		try {
			if (phase === '1') {
				const result = await runPhase1(cfg, rd, deal);

				if (result?.shouldMarkDone !== false) {
				markDone(cfg, state, '1', dealId);
				}
			} else if (phase === '2') {
				const result = await runPhase2(cfg, rd, deal);

				if (result?.shouldMarkDone !== false) {
				markDone(cfg, state, '2', dealId);
				}
			} else if (phase === 'both') {
				if (!state?.phases?.['1']?.done?.includes(dealId)) {
				const phase1Result = await runPhase1(cfg, rd, deal);

				if (phase1Result?.shouldMarkDone !== false) {
					markDone(cfg, state, '1', dealId);
				}

				await sleep(cfg.requestDelayMs);
				}
				if (!state?.phases?.['2']?.done?.includes(dealId)) {
				const phase2Result = await runPhase2(cfg, rd, deal);

				if (phase2Result?.shouldMarkDone !== false) {
					markDone(cfg, state, '2', dealId);
				}
				}
			} else {
				throw new Error(`Invalid --phase=${phase}. Use 1, 2 or both.`);
			}

			processed++;
			await sleep(cfg.requestDelayMs);
		} catch (err) {
			const phaseKey = phase === 'both' ? 'both' : String(phase);
			logPhaseError(cfg, phaseKey, dealId, err);
			markFail(cfg, state, phaseKey === 'both' ? 'both' : String(phase), dealId, err);
			await sleep(cfg.requestDelayMs);
		}
	}

	console.log(`\nDone. processed=${processed} reports_dir=${path.relative(process.cwd(), cfg.reportDir)}`);
}

async function runPhase1(cfg, rd, deal) {
	const payload = buildPhase1Payload(cfg, deal);

	if (!payload) {
		reportJsonl(cfg, 'phase1_skipped', { dealId: deal.id, reason: 'no_mapping_or_empty_payload' });
		
		return { shouldMarkDone: true };
	}

	await rd.updateDeal(deal.id, payload);

	reportJsonl(cfg, 'phase1_ok', { dealId: deal.id, payload });

	if (cfg.verifyAfterUpdate) {
		const after = await rd.getDeal(deal.id);

		reportJsonl(cfg, 'phase1_verify', { dealId: deal.id, custom_fields: after?.data?.custom_fields || {} });
	}

	return { shouldMarkDone: !cfg.dryRun };
}

async function runPhase2(cfg, rd, deal) {
	const payload = buildPhase2Payload(cfg, deal);
	
	if (!payload) {
		reportJsonl(cfg, 'phase2_skipped', { dealId: deal.id, reason: 'no_mapping_or_empty_payload' });
		
		return { shouldMarkDone: true };
	}

	await rd.updateDeal(deal.id, payload);

	reportJsonl(cfg, 'phase2_ok', { dealId: deal.id, payload });

	return { shouldMarkDone: !cfg.dryRun };
}
