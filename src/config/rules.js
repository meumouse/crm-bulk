import { DEAL_FIELD_SLUGS, PRODUCT_MODEL_BY_PRODUCT, SOURCE_FUNNELS, TARGET_FUNNELS, STAGE_LABELS } from './rd-config.js';
import { uniq } from '../utils/collection.js';

function buildStageIndex() {
  const byStageId = new Map();

  for (const [funnelName, funnel] of Object.entries(SOURCE_FUNNELS)) {
    for (const [stageKey, stageId] of Object.entries(funnel.stages)) {
      byStageId.set(stageId, {
        stageId,
        stageKey,
        stageLabel: STAGE_LABELS[stageKey] || stageKey,
        funnelName,
        funnelType: funnel.type,
        productName: funnelName.startsWith('Clientes ') ? funnelName.replace(/^Clientes\s+/i, '').trim() : funnelName,
      });
    }
  }

  return byStageId;
}

const STAGE_INDEX = buildStageIndex();

/**
 * Determines if we should touch a deal based on its current stage_id.
 */
export function isMappedStage(stageId) {
  return STAGE_INDEX.has(stageId);
}

/**
 * Phase 1: build payload for custom_fields.
 * - Interest funnels: set produto-de-interesse, modelo-do-produto, pipeline-atual
 * - Customer funnels: set produto-adquirido, modelo-do-produto="Pago", pipeline-atual
 */
export function buildPhase1Payload(cfg, deal) {
  const meta = STAGE_INDEX.get(deal?.stage_id);
  if (!meta) return null;

  // Fase 1 (funis de interesse): preencher também em etapas mais avançadas.
  // Regras:
  // - Mensagem enviada
  // - Demonstrou interesse
  // - Oferta enviada
  // - Follow up da oferta
  // - Comprou
  // (Mantemos Sem contato + Mensagem automática para compatibilidade)
  const PHASE1_INTEREST_ALLOWED = new Set([
    'SEM_CONTATO',
    'MENSAGEM_AUTOMATICA',
    'MENSAGEM_ENVIADA',
    'DEMONSTROU_INTERESSE',
    'OFERTA_ENVIADA',
    'FOLLOW_UP_OFERTA',
    'COMPROU',
  ]);

  if (meta.funnelType === 'interest' && !PHASE1_INTEREST_ALLOWED.has(meta.stageKey)) {
    return null;
  }

  const customFields = deal?.custom_fields || deal?.data?.custom_fields || {};
  const next = {};

  const pipelineAtual = cfg.pipelineAtualIncludeFunil
    ? `${meta.funnelName} - ${meta.stageLabel}`
    : meta.stageLabel;

  next[DEAL_FIELD_SLUGS.pipelineAtual] = pipelineAtual;

  if (meta.funnelType === 'interest') {
    const model = PRODUCT_MODEL_BY_PRODUCT[meta.productName] || 'Pago';
    next[DEAL_FIELD_SLUGS.modeloProduto] = model;

    const current = Array.isArray(customFields?.[DEAL_FIELD_SLUGS.produtoInteresse])
      ? customFields[DEAL_FIELD_SLUGS.produtoInteresse]
      : [];

    const merged = cfg.mergeMultiSelect ? uniq([...current, meta.productName]) : [meta.productName];
    next[DEAL_FIELD_SLUGS.produtoInteresse] = merged;
  }

  if (meta.funnelType === 'customer') {
    next[DEAL_FIELD_SLUGS.modeloProduto] = 'Pago';

    const current = Array.isArray(customFields?.[DEAL_FIELD_SLUGS.produtoAdquirido])
      ? customFields[DEAL_FIELD_SLUGS.produtoAdquirido]
      : [];

    const merged = cfg.mergeMultiSelect ? uniq([...current, meta.productName]) : [meta.productName];
    next[DEAL_FIELD_SLUGS.produtoAdquirido] = merged;
  }

  // Remove empty values
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null) delete next[k];
    if (Array.isArray(v) && v.length === 0) delete next[k];
    if (typeof v === 'string' && !v.trim()) delete next[k];
  }

  if (!Object.keys(next).length) return null;

  return { custom_fields: next };
}

/**
 * Phase 2: stage/pipeline migration.
 *
 * Rules:
 * - Interest funnels -> "Low Ticket"
 *   - Sem contato + Mensagem automática -> Sem contato
 *   - Mensagem enviada -> Contato feito
 *   - Demonstrou interesse + Oferta enviada + Follow-up -> Identificação do interesse
 *   - Comprou -> Assinou
 *   - Downsell -> Downsell
 * - Customer funnels ("Clientes ...") -> "Assinaturas / Recorrente" in stage "Cliente ativo"
 */
export function buildPhase2Payload(cfg, deal) {
  const meta = STAGE_INDEX.get(deal?.stage_id);
  if (!meta) return null;

  if (meta.funnelType === 'customer') {
    const stageId = TARGET_FUNNELS.ASSINATURAS_RECORRENTE.stages.CLIENTE_ATIVO;
    const pipelineId = cfg.pipelineIdByName?.[TARGET_FUNNELS.ASSINATURAS_RECORRENTE.name] || null;

    const payload = { stage_id: stageId };
    if (pipelineId) payload.pipeline_id = pipelineId;
    return payload;
  }

  if (meta.funnelType === 'interest') {
    const low = TARGET_FUNNELS.LOW_TICKET;
    let destStageId = null;

    switch (meta.stageKey) {
      case 'SEM_CONTATO':
      case 'MENSAGEM_AUTOMATICA':
        destStageId = low.stages.SEM_CONTATO;
        break;
      case 'MENSAGEM_ENVIADA':
        // Requisito: Mensagem enviada -> Contato feito
        destStageId = low.stages.CONTATO_FEITO;
        break;
      case 'DEMONSTROU_INTERESSE':
      case 'OFERTA_ENVIADA':
      case 'FOLLOW_UP_OFERTA':
        // Requisito: Demonstrou interesse / Oferta enviada / Follow up -> Identificação do interesse
        destStageId = low.stages.IDENTIFICACAO_INTERESSE;
        break;
      case 'COMPROU':
        // Requisito: Comprou -> Assinou
        destStageId = low.stages.ASSINOU;
        break;
      case 'DOWNSELL':
        destStageId = low.stages.DOWNSELL;
        break;
      default:
        return null;
    }

    const pipelineId = cfg.pipelineIdByName?.[low.name] || null;

    const payload = { stage_id: destStageId };
    if (pipelineId) payload.pipeline_id = pipelineId;
    return payload;
  }

  return null;
}
