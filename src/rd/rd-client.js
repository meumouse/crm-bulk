import { requestWithRetry } from './http-client.js';

function extractArray(obj, keys) {
  for (const k of keys) {
    if (Array.isArray(obj?.[k])) return obj[k];
  }
  return null;
}

export function createRdClient(cfg, http) {
  const pipelineIdByName = {}; // injected into cfg for rules
  const stageToPipelineId = {}; // stage_id -> pipeline_id

  async function listDealsPage({ pageNumber, pageSize }) {
    return requestWithRetry(cfg, async () => {
      if (cfg.paginationMode === 'page_limit') {
        const res = await http.get('/crm/v2/deals', { params: { page: pageNumber, limit: pageSize } });
        return res.data;
      }
      const res = await http.get('/crm/v2/deals', { params: { 'page[number]': pageNumber, 'page[size]': pageSize } });
      return res.data;
    }, `listDeals:page=${pageNumber}`);
  }

  async function getDeal(dealId) {
    return requestWithRetry(cfg, async () => {
      const res = await http.get(`/crm/v2/deals/${dealId}`);
      return res.data;
    }, `getDeal:${dealId}`);
  }

  async function updateDeal(dealId, dataPayload) {
    if (cfg.dryRun) {
      console.log(`[DRY_RUN] PUT /crm/v2/deals/${dealId}`, JSON.stringify({ data: dataPayload }));
      return { dry_run: true };
    }

    return requestWithRetry(cfg, async () => {
      const res = await http.put(`/crm/v2/deals/${dealId}`, { data: dataPayload });
      return res.data;
    }, `updateDeal:${dealId}`);
  }

  async function listPipelines() {
    return requestWithRetry(cfg, async () => {
      const res = await http.get('/crm/v2/pipelines');
      return res.data;
    }, 'listPipelines');
  }

  async function listPipelineStages(pipelineId) {
    return requestWithRetry(cfg, async () => {
      const res = await http.get(`/crm/v2/pipelines/${pipelineId}/stages`);
      return res.data;
    }, `listStages:${pipelineId}`);
  }

  async function warmupPipelineCache() {
    // Load pipelines and build name->id (best-effort)
    try {
      const data = await listPipelines();
      const pipelines = extractArray(data, ['pipelines', 'data', 'items']) || [];

      for (const p of pipelines) {
        if (p?.name && p?.id) {
          pipelineIdByName[p.name] = p.id;
        }
      }

      // Build stage->pipeline map (best-effort)
      for (const [name, id] of Object.entries(pipelineIdByName)) {
        try {
          const stageData = await listPipelineStages(id);
          const stages = extractArray(stageData, ['stages', 'data', 'items']) || [];

          for (const s of stages) {
            if (s?.id) stageToPipelineId[s.id] = id;
          }
        } catch {
          // ignore
        }
      }

      cfg.pipelineIdByName = pipelineIdByName;
      cfg.stageToPipelineId = stageToPipelineId;
    } catch {
      cfg.pipelineIdByName = pipelineIdByName;
      cfg.stageToPipelineId = stageToPipelineId;
    }
  }

  return {
    listDealsPage,
    getDeal,
    updateDeal,
    listPipelines,
    listPipelineStages,
    warmupPipelineCache,
  };
}
