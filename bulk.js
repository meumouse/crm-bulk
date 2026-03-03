/**
 * RD Station CRM bulk migration helper
 * - Phase 1: fill deal custom fields based on current stage (old funnels)
 * - Phase 2: move deal to new pipeline/stage
 *
 * Uses:
 *  - GET  /crm/v2/deals
 *  - GET  /crm/v2/custom_fields
 *  - PUT  /crm/v2/deals/{id}
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import axios from 'axios';
import 'dotenv/config';

const BASE_URL = process.env.RD_BASE_URL || 'https://api.rd.services';
const ACCESS_TOKEN = process.env.RD_ACCESS_TOKEN;
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 250);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 5);
const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';

if (!ACCESS_TOKEN) {
  console.error('Missing RD_ACCESS_TOKEN in .env');
  process.exit(1);
}

const REPORT_DIR = path.resolve(process.cwd(), 'reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const STATE_FILE = path.resolve(process.cwd(), 'state.json');
const state = loadState();

/**
 * Your custom field IDs (deal entity)
 */
const DEAL_FIELDS = {
  produtoInteresse: '699e11f83a0cfb0013eece88',
  produtoAdquirido: '699e126df83d3d001b7912b5',
  modeloProduto: '699e129c96c50d0012c779fc',
  pipelineAtual: '699e1326f83d3d00157915d2',
};

/**
 * Labels for field values (we’ll resolve to option_id via custom_fields API)
 */
const LABELS = {
  produtos: [
    'Parcelas Customizadas',
    'Flexify Checkout',
    'Flexify Dashboard',
    'Account Genius',
    'Joinotify',
    'Clube M',
    'AutomateChat',
    'HubGo',
  ],
  modelos: ['Gratuito', 'Freemium', 'Pago', 'Em desenvolvimento'],
};

/**
 * Destination (new) pipelines/stages ids you gave
 */
const DEST = {
  lowTicket: {
    semContato: '699f370e74af8e001dae7d9c',
    contatoFeito: '699f370e74af8e001dae7d9d',
    identificacaoInteresse: '699f370e74af8e001dae7d9e',
    periodoGratis: '699f370e74af8e001dae7d9f',
    assinou: '699f370e74af8e001dae7da0',
    downsell: '69a5ecd0bd4e940013e2735b',
  },
  assinaturas: {
    clienteAtivo: '699f384f74daa900167dbb06',
    tentativaUpsell: '699f384f74daa900167dbb07',
    propostaUpgrade: '699f384f74daa900167dbb08',
    negociacaoUpgrade: '699f384f74daa900167dbb09',
    upgradeRealizado: '699f384f74daa900167dbb0a',
    // você citou “Cancelou” mas não passou ID — quando tiver, adiciona aqui.
  },
  clubeM: {
    leadElegivel: '699f3d31a911d80016962dc0',
    apresentacao: '699f3d31a911d80016962dc1',
    propostaEnviada: '699f3d31a911d80016962dc2',
    negociacao: '699f3d31a911d80016962dc3',
    assinou: '699f3d31a911d80016962dc4',
  },
  highTicket: {
    leadQualificado: '699f38627470210017a5aacd',
    diagnosticoEnviado: '699f38627470210017a5aace',
    reuniao: '699f38627470210017a5aacf',
    propostaEnviada: '699f38627470210017a5aad0',
    negociacao: '699f38627470210017a5aad1',
    fechadoGanho: '69a5fdfe4b81060013e47399',
    // “Perdido” não veio com ID — quando tiver, adiciona.
  },
};

/**
 * OLD stages mapping → product + “interest vs acquired” + old stage label + destination stage
 *
 * NOTE:
 * - You can adjust any “oldStageLabel” string to match exactly your Pipeline Atual options labels.
 * - If an option is missing, script will log and skip that field safely.
 */
const OLD_STAGE_MAP = buildOldStageMap( DEST );

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * CLI
 *   node bulk.js --phase=1
 *   node bulk.js --phase=2
 * optional:
 *   --limit=100 (stop after n deals)
 *   --onlyStage=ID (process only deals currently in this old stage_id)
 */
const args = parseArgs(process.argv.slice(2));
const PHASE = String(args.phase || '1');
const LIMIT = args.limit ? Number(args.limit) : null;
const ONLY_STAGE = args.onlyStage ? String(args.onlyStage) : null;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  console.log(`\nRD bulk script`);
  console.log(`- Phase: ${PHASE}`);
  console.log(`- DRY_RUN: ${DRY_RUN}`);
  console.log(`- Delay: ${REQUEST_DELAY_MS}ms\n`);

  // 1) Load custom field definitions to resolve option ids by label
  const dealFieldDefs = await loadDealCustomFieldDefinitions();

  // 2) Iterate deals
  let processed = 0;
  for await (const deal of iterateDeals()) {
    if (LIMIT && processed >= LIMIT) break;

    const dealId = deal?.id;
    const stageId = deal?.stage_id;

    if (!dealId || !stageId) continue;
    if (ONLY_STAGE && stageId !== ONLY_STAGE) continue;

    // checkpoint: skip if already processed in this phase
    if (state?.phases?.[PHASE]?.done?.includes(dealId)) continue;

    const mapping = OLD_STAGE_MAP[stageId];
    if (!mapping) continue; // ignore deals from stages you didn't map

    const ctx = { dealId, stageId, mapping };

    try {
      if (PHASE === '1') {
        await phase1FillFields(ctx, dealFieldDefs);
      } else if (PHASE === '2') {
        await phase2MoveDeal(ctx);
      } else {
        throw new Error(`Invalid --phase=${PHASE}`);
      }

      markDone(PHASE, dealId);
      processed++;

      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      logError(PHASE, dealId, err);
      markFail(PHASE, dealId, err);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  saveState();
  console.log(`\nDone. Processed=${processed}`);
}

async function phase1FillFields(ctx, dealFieldDefs) {
  const { dealId, mapping } = ctx;

  const payload = buildDealUpdatePayloadPhase1(mapping, dealFieldDefs);

  if (!payload || Object.keys(payload).length === 0) {
    report('phase1_skipped', { dealId, reason: 'empty_payload' });
    return;
  }

  await updateDeal(dealId, payload, 'phase1');
  report('phase1_ok', { dealId, payload });
}

async function phase2MoveDeal(ctx) {
  const { dealId, mapping } = ctx;

  const destStageId = mapping.destStageId;
  if (!destStageId) {
    report('phase2_skipped', { dealId, reason: 'no_dest_stage' });
    return;
  }

  // Minimal move payload: stage_id
  // RD docs say update-deal can move between stages/pipelines via this endpoint. :contentReference[oaicite:3]{index=3}
  const payload = { stage_id: destStageId };

  await updateDeal(dealId, payload, 'phase2');
  report('phase2_ok', { dealId, stage_id: destStageId });
}

/**
 * Update deal with retry/backoff
 */
async function updateDeal(dealId, body, tag) {
  if (DRY_RUN) {
    console.log(`[DRY_RUN] PUT /crm/v2/deals/${dealId}`, JSON.stringify(body));
    return;
  }

  await requestWithRetry(async () => {
    // Endpoint from docs: PUT https://api.rd.services/crm/v2/deals/{id} :contentReference[oaicite:4]{index=4}
    const res = await http.put(`/crm/v2/deals/${dealId}`, body);
    return res.data;
  }, `${tag}:updateDeal:${dealId}`);
}

/**
 * Deals iterator (pagination-agnostic)
 * - tries to follow: meta.next_page / next_page / links.next / etc.
 */
async function* iterateDeals() {
  // Docs: GET https://api.rd.services/crm/v2/deals :contentReference[oaicite:5]{index=5}
  let url = `/crm/v2/deals`;
  let safety = 0;

  while (url && safety < 10000) {
    safety++;

    const data = await requestWithRetry(async () => {
      const res = await http.get(url);
      return res.data;
    }, `listDeals:${url}`);

    const deals = extractArray(data, ['deals', 'data', 'items']) || [];
    for (const d of deals) yield d;

    url = extractNextPageUrl(data);
  }
}

function extractNextPageUrl(data) {
  // common patterns
  const next =
    data?.meta?.next_page ||
    data?.next_page ||
    data?.links?.next ||
    data?.paging?.next ||
    null;

  if (!next) return null;

  // if it’s a full URL, convert to relative for axios baseURL
  if (typeof next === 'string' && next.startsWith('http')) {
    try {
      const u = new URL(next);
      return u.pathname + u.search;
    } catch {
      return null;
    }
  }

  return typeof next === 'string' ? next : null;
}

function extractArray(obj, keys) {
  for (const k of keys) {
    if (Array.isArray(obj?.[k])) return obj[k];
  }
  return null;
}

/**
 * Load deal custom fields definitions and build:
 * fieldId -> { type, optionsLabelToId }
 */
async function loadDealCustomFieldDefinitions() {
  // Docs: GET https://api.rd.services/crm/v2/custom_fields :contentReference[oaicite:6]{index=6}
  const data = await requestWithRetry(async () => {
    const res = await http.get(`/crm/v2/custom_fields`, {
      params: { query: 'entity:deal' }, // if API supports RDQL param as query
    });
    return res.data;
  }, 'listCustomFields');

  const fields = extractArray(data, ['custom_fields', 'data', 'items']) || [];

  const map = {};
  for (const f of fields) {
    if (!f?.id) continue;
    map[f.id] = {
      id: f.id,
      slug: f.slug,
      field_type: f.field_type,
      optionsLabelToId: buildOptionsMap(f),
    };
  }
  return map;
}

function buildOptionsMap(field) {
  const options = field?.options || field?.choices || [];
  const m = {};
  if (Array.isArray(options)) {
    for (const opt of options) {
      const label = opt?.label || opt?.value || opt?.name;
      const id = opt?.id || opt?.value_id || opt?.option_id;
      if (label && id) m[String(label).trim()] = String(id);
    }
  }
  return m;
}

/**
 * Phase 1 payload builder (safe):
 * - resolves labels to option_id when possible
 * - if not found, logs and skips that field value
 *
 * IMPORTANT: RD’s exact payload shape for custom fields can vary.
 * This builder uses a very common structure:
 *   { custom_fields: [ { custom_field_id, value }, ... ] }
 *
 * If the API returns 400 complaining about shape, you only change this function.
 */
function buildDealUpdatePayloadPhase1(mapping, defs) {
  const updates = [];

  // Produto de interesse (multi)
  if (mapping.produtoInteresse?.length) {
    const v = resolveMulti(defs, DEAL_FIELDS.produtoInteresse, mapping.produtoInteresse);
    if (v) updates.push({ custom_field_id: DEAL_FIELDS.produtoInteresse, value: v });
  }

  // Produto adquirido (multi)
  if (mapping.produtoAdquirido?.length) {
    const v = resolveMulti(defs, DEAL_FIELDS.produtoAdquirido, mapping.produtoAdquirido);
    if (v) updates.push({ custom_field_id: DEAL_FIELDS.produtoAdquirido, value: v });
  }

  // Modelo do produto (single)
  if (mapping.modeloProduto) {
    const v = resolveSingle(defs, DEAL_FIELDS.modeloProduto, mapping.modeloProduto);
    if (v) updates.push({ custom_field_id: DEAL_FIELDS.modeloProduto, value: v });
  }

  // Pipeline atual (single) - store old stage label
  if (mapping.pipelineAtualLabel) {
    const v = resolveSingle(defs, DEAL_FIELDS.pipelineAtual, mapping.pipelineAtualLabel);
    if (v) updates.push({ custom_field_id: DEAL_FIELDS.pipelineAtual, value: v });
  }

  if (updates.length === 0) return null;

  // ⚠️ Adjust here if your API expects a different structure.
  return { custom_fields: updates };
}

function resolveSingle(defs, fieldId, label) {
  const def = defs?.[fieldId];
  if (!def) return null;

  // try option_id
  const optionId = def.optionsLabelToId?.[String(label).trim()];
  if (optionId) return optionId;

  // fallback: sometimes APIs accept raw label; keep it as last resort
  // If you want "strict only", return null here.
  return String(label).trim();
}

function resolveMulti(defs, fieldId, labels) {
  const def = defs?.[fieldId];
  if (!def) return null;

  const arr = [];
  for (const l of labels) {
    const optionId = def.optionsLabelToId?.[String(l).trim()];
    arr.push(optionId || String(l).trim());
  }

  return arr.length ? arr : null;
}

/**
 * Map your old stages into business rules:
 * - interest funnels -> Produto de interesse
 * - customer funnels -> Produto adquirido
 * - determine destination stage in new funnels (phase2)
 */
function buildOldStageMap( dest ) {
  const map = {};

  // helper
  const add = (oldStageId, cfg) => (map[oldStageId] = cfg);

  // ===== Interest funnels → Low Ticket =====
  // Rule you gave:
  // - Sem contato + Mensagem automática -> Low Ticket: Sem contato
  // - Mensagem enviada -> Contato feito
  // - Demonstrou interesse / Oferta enviada / Follow-up -> Identificação do interesse
  // - Comprou -> Assinou
  // - Downsell -> Downsell

  // Parcelas Customizadas (interesse)
  add('660f0b8e342d130018be8cdd', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Sem contato', dest.lowTicket.semContato));
  add('6683007ae5e01300130510c1', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Mensagem automática', dest.lowTicket.semContato));
  add('660f0b8e342d130018be8cde', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Mensagem enviada', dest.lowTicket.contatoFeito));
  add('660f0b8e342d130018be8cdf', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Demonstrou interesse', dest.lowTicket.identificacaoInteresse));
  add('660f0b8e342d130018be8ce0', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Oferta enviada', dest.lowTicket.identificacaoInteresse));
  add('660f0b8e342d130018be8ce1', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Follow up da oferta', dest.lowTicket.identificacaoInteresse));
  add('66146b243ea29a0020248f7a', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Comprou', dest.lowTicket.assinou));
  add('66146b3dbbd78b001f7b4c02', mkInterest('Parcelas Customizadas', 'Parcelas Customizadas - Downsell', dest.lowTicket.downsell));

  // Flexify Checkout (interesse)
  add('661443948473f20020c09905', mkInterest('Flexify Checkout', 'Flexify Checkout - Sem contato', dest.lowTicket.semContato));
  add('66835a8236e31700107d4e10', mkInterest('Flexify Checkout', 'Flexify Checkout - Mensagem automática', dest.lowTicket.semContato));
  add('661443948473f20020c09906', mkInterest('Flexify Checkout', 'Flexify Checkout - Mensagem enviada', dest.lowTicket.contatoFeito));
  add('661443948473f20020c09907', mkInterest('Flexify Checkout', 'Flexify Checkout - Demonstrou interesse', dest.lowTicket.identificacaoInteresse));
  add('661443948473f20020c09908', mkInterest('Flexify Checkout', 'Flexify Checkout - Oferta enviada', dest.lowTicket.identificacaoInteresse));
  add('661443958473f20020c0990a', mkInterest('Flexify Checkout', 'Flexify Checkout - Follow up da oferta', dest.lowTicket.identificacaoInteresse));
  add('66146bfcee0388000e0f63cf', mkInterest('Flexify Checkout', 'Flexify Checkout - Comprou', dest.lowTicket.assinou));
  add('66146c060b7821000d0bbb91', mkInterest('Flexify Checkout', 'Flexify Checkout - Downsell', dest.lowTicket.downsell));

  // Flexify Dashboard (interesse)
  add('661443a83ea29a0014245f9f', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Sem contato', dest.lowTicket.semContato));
  add('66835abf06871900176357ab', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Mensagem automática', dest.lowTicket.semContato));
  add('661443a83ea29a0014245fa0', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Mensagem enviada', dest.lowTicket.contatoFeito));
  add('661443a83ea29a0014245fa1', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Demonstrou interesse', dest.lowTicket.identificacaoInteresse));
  add('661443a83ea29a0014245fa2', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Oferta enviada', dest.lowTicket.identificacaoInteresse));
  add('661443a83ea29a0014245fa3', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Follow up da oferta', dest.lowTicket.identificacaoInteresse));
  add('66847f5d4951890010fd2c7f', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Comprou', dest.lowTicket.assinou));
  add('66146c510b58e5000df76f64', mkInterest('Flexify Dashboard', 'Flexify Dashboard - Downsell', dest.lowTicket.downsell));

  // Account Genius (interesse)
  add('661443dacf5ad40014330a3c', mkInterest('Account Genius', 'Account Genius - Sem contato', dest.lowTicket.semContato));
  add('66835ae3b9963200224d010c', mkInterest('Account Genius', 'Account Genius - Mensagem automática', dest.lowTicket.semContato));
  add('661443dacf5ad40014330a3d', mkInterest('Account Genius', 'Account Genius - Mensagem enviada', dest.lowTicket.contatoFeito));
  add('661443dacf5ad40014330a3e', mkInterest('Account Genius', 'Account Genius - Demonstrou interesse', dest.lowTicket.identificacaoInteresse));
  add('661443dacf5ad40014330a3f', mkInterest('Account Genius', 'Account Genius - Oferta enviada', dest.lowTicket.identificacaoInteresse));
  add('661443dacf5ad40014330a40', mkInterest('Account Genius', 'Account Genius - Follow up da oferta', dest.lowTicket.identificacaoInteresse));
  add('66146cd50b782100190bbe13', mkInterest('Account Genius', 'Account Genius - Comprou', dest.lowTicket.assinou));
  add('66146ce37e71260014125aaa', mkInterest('Account Genius', 'Account Genius - Downsell', dest.lowTicket.downsell));

  // Joinotify (interesse)
  add('675053c514571e00134602f2', mkInterest('Joinotify', 'Joinotify - Sem contato', dest.lowTicket.semContato));
  add('675053c514571e00134602f3', mkInterest('Joinotify', 'Joinotify - Mensagem automática', dest.lowTicket.semContato));
  add('675053c514571e00134602f4', mkInterest('Joinotify', 'Joinotify - Mensagem enviada', dest.lowTicket.contatoFeito));
  add('675053c514571e00134602f5', mkInterest('Joinotify', 'Joinotify - Demonstrou interesse', dest.lowTicket.identificacaoInteresse));
  add('675053c514571e00134602f6', mkInterest('Joinotify', 'Joinotify - Oferta enviada', dest.lowTicket.identificacaoInteresse));
  add('6750540a5427a800196c39ef', mkInterest('Joinotify', 'Joinotify - Follow up da oferta', dest.lowTicket.identificacaoInteresse));
  add('6750541a0040eb0019e99e14', mkInterest('Joinotify', 'Joinotify - Comprou', dest.lowTicket.assinou));
  add('6750543c37e542001ecc3572', mkInterest('Joinotify', 'Joinotify - Downsell', dest.lowTicket.downsell));

  // Clube M (interesse) → vai para pipeline Clube M (regra sua)
  add('6737d404de65ed0013eadef9', mkInterest('Clube M', 'Clube M - Sem contato', dest.clubeM.leadElegivel));
  add('6737d4314abefe0013c02fb4', mkInterest('Clube M', 'Clube M - Mensagem automática', dest.clubeM.leadElegivel));
  add('6685683fdae88e00221287dc', mkInterest('Clube M', 'Clube M - Mensagem enviada', dest.clubeM.apresentacao));
  add('6685683fdae88e00221287dd', mkInterest('Clube M', 'Clube M - Demonstrou interesse', dest.clubeM.apresentacao));
  add('6685683fdae88e00221287db', mkInterest('Clube M', 'Clube M - Oferta enviada', dest.clubeM.propostaEnviada));
  add('6737d47d3c5a170016a92c5f', mkInterest('Clube M', 'Clube M - Follow up', dest.clubeM.negociacao));
  add('6737d49660562c001dddabf9', mkInterest('Clube M', 'Clube M - Comprou', dest.clubeM.assinou));
  add('6737d4d8a2405f002a0a66b5', mkInterest('Clube M', 'Clube M - Downsell', dest.clubeM.negociacao));

  // ===== Customer funnels → Assinaturas/Recorrente =====
  // Você disse: “Assinatura / Recorrente vai receber todos os antigos funis de clientes ativos”.
  // Como você não passou IDs das etapas novas “Cancelou”, vou mapear:
  // - Sem contato/Mensagem automática/Mensagem enviada -> Cliente ativo (conservador)
  // - Demonstrou interesse/Oferta/Follow-up -> Tentativa de upsell
  // - Comprou -> Upgrade realizado
  // - Downsell -> Tentativa de upsell

  // Clientes Parcelas
  add('6614440ee39e860014e99f96', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Sem contato', DEST.assinaturas.clienteAtivo));
  add('66835b2214d4ea000f771da8', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Mensagem automática', DEST.assinaturas.clienteAtivo));
  add('6614440ee39e860014e99f97', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Mensagem enviada', DEST.assinaturas.clienteAtivo));
  add('6614440ee39e860014e99f98', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Demonstrou interesse', DEST.assinaturas.tentativaUpsell));
  add('6614440ee39e860014e99f99', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Oferta enviada', DEST.assinaturas.propostaUpgrade));
  add('6614440ee39e860014e99f9a', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Follow up', DEST.assinaturas.negociacaoUpgrade));
  add('66146d324dadf4001bdf157b', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Comprou', DEST.assinaturas.upgradeRealizado));
  add('66146d4442c13a00133e1ba3', mkAcquired('Parcelas Customizadas', 'Clientes Parcelas - Downsell', DEST.assinaturas.tentativaUpsell));

  // Clientes Flexify Checkout
  add('6614441d14083a0010a4d091', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Sem contato', DEST.assinaturas.clienteAtivo));
  add('66835b51b57ae2001047efe2', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Mensagem automática', DEST.assinaturas.clienteAtivo));
  add('6614441d14083a0010a4d092', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Mensagem enviada', DEST.assinaturas.clienteAtivo));
  add('6614441d14083a0010a4d093', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Demonstrou interesse', DEST.assinaturas.tentativaUpsell));
  add('6614441d14083a0010a4d094', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Oferta enviada', DEST.assinaturas.propostaUpgrade));
  add('6614441d14083a0010a4d095', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Follow up', DEST.assinaturas.negociacaoUpgrade));
  add('66146d7ea8ae31000d45629a', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Comprou', DEST.assinaturas.upgradeRealizado));
  add('66146d8abbd78b001f7b4cdb', mkAcquired('Flexify Checkout', 'Clientes Flexify Checkout - Downsell', DEST.assinaturas.tentativaUpsell));

  // Clientes Flexify Dashboard
  add('66144431c0e4e7002088e214', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Sem contato', DEST.assinaturas.clienteAtivo));
  add('66835b790c9f250010056ba1', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Mensagem automática', DEST.assinaturas.clienteAtivo));
  add('66144431c0e4e7002088e215', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Mensagem enviada', DEST.assinaturas.clienteAtivo));
  add('66144431c0e4e7002088e216', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Demonstrou interesse', DEST.assinaturas.tentativaUpsell));
  add('66144431c0e4e7002088e217', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Oferta enviada', DEST.assinaturas.propostaUpgrade));
  add('66144431c0e4e7002088e218', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Follow up', DEST.assinaturas.negociacaoUpgrade));
  add('66146dc9fe2d1a0020acee3e', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Comprou', DEST.assinaturas.upgradeRealizado));
  add('66146dde27131f000dd1b2c5', mkAcquired('Flexify Dashboard', 'Clientes Flexify Dashboard - Downsell', DEST.assinaturas.tentativaUpsell));

  // Clientes Account Genius
  add('66144440120c0a00170a464e', mkAcquired('Account Genius', 'Clientes Account Genius - Sem contato', DEST.assinaturas.clienteAtivo));
  add('66835b9094b600001abb3fd3', mkAcquired('Account Genius', 'Clientes Account Genius - Mensagem automática', DEST.assinaturas.clienteAtivo));
  add('66144440120c0a00170a4656', mkAcquired('Account Genius', 'Clientes Account Genius - Mensagem enviada', DEST.assinaturas.clienteAtivo));
  add('66144440120c0a00170a4657', mkAcquired('Account Genius', 'Clientes Account Genius - Demonstrou interesse', DEST.assinaturas.tentativaUpsell));
  add('66144441120c0a00170a4658', mkAcquired('Account Genius', 'Clientes Account Genius - Oferta enviada', DEST.assinaturas.propostaUpgrade));
  add('66144441120c0a00170a4659', mkAcquired('Account Genius', 'Clientes Account Genius - Follow up', DEST.assinaturas.negociacaoUpgrade));
  add('66146e093c6f7e0014492bef', mkAcquired('Account Genius', 'Clientes Account Genius - Comprou', DEST.assinaturas.upgradeRealizado));
  add('66146e180b58e50014f76fdf', mkAcquired('Account Genius', 'Clientes Account Genius - Downsell', DEST.assinaturas.tentativaUpsell));

  return map;
}

function mkInterest(produto, pipelineAtualLabel, destStageId) {
  return {
    produtoInteresse: [produto],
    produtoAdquirido: [],
    modeloProduto: 'Pago', // ajuste se quiser inferir diferente
    pipelineAtualLabel,
    destStageId,
  };
}

function mkAcquired(produto, pipelineAtualLabel, destStageId) {
  return {
    produtoInteresse: [],
    produtoAdquirido: [produto],
    modeloProduto: 'Pago', // ajuste se quiser inferir diferente
    pipelineAtualLabel,
    destStageId,
  };
}

/**
 * Retry helper with exponential backoff + jitter
 */
async function requestWithRetry(fn, tag) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      const retryable = !status || status >= 500 || status === 429;

      if (!retryable || attempt >= MAX_RETRIES) {
        throw enrichAxiosError(err, tag);
      }

      const wait = Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`[retry] ${tag} attempt=${attempt} status=${status} wait=${wait}ms`);
      await sleep(wait);
    }
  }
}

function enrichAxiosError(err, tag) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const msg = `[${tag}] status=${status} data=${safeJson(data)}`;
  const e = new Error(msg);
  e.original = err;
  return e;
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v ?? true;
  }
  return out;
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { phases: { '1': { done: [], fail: [] }, '2': { done: [], fail: [] } } };
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    parsed.phases ??= { '1': { done: [], fail: [] }, '2': { done: [], fail: [] } };
    parsed.phases['1'] ??= { done: [], fail: [] };
    parsed.phases['2'] ??= { done: [], fail: [] };
    return parsed;
  } catch {
    return { phases: { '1': { done: [], fail: [] }, '2': { done: [], fail: [] } } };
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function markDone(phase, id) {
  state.phases[phase].done.push(id);
  // keep state small-ish
  state.phases[phase].done = unique(state.phases[phase].done).slice(-200000);
  saveState();
}

function markFail(phase, id, err) {
  state.phases[phase].fail.push({ id, error: String(err?.message || err) });
  saveState();
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function logError(phase, dealId, err) {
  const file = path.join(REPORT_DIR, `errors_phase_${phase}.log`);
  fs.appendFileSync(file, `${new Date().toISOString()} deal=${dealId} ${String(err?.message || err)}\n`);
}

function report(type, payload) {
  const file = path.join(REPORT_DIR, `${type}.jsonl`);
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n');
}