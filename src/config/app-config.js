import path from 'node:path';
import process from 'node:process';

export function getAppConfig(cliArgs = {}) {
  const env = process.env;

  const toBool = (v, def) => {
    if (v === undefined || v === null || v === '') return def;
    return String(v).toLowerCase() === 'true';
  };

  const toNum = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  const baseUrl = env.RD_BASE_URL || 'https://api.rd.services';

  // OAuth (preferred)
  const clientId = env.RD_CLIENT_ID || null;
  const clientSecret = env.RD_CLIENT_SECRET || null;
  const tokenUrl = env.RD_TOKEN_URL || 'https://api.rd.services/oauth2/token';
  const oauthStateFile = path.resolve(process.cwd(), env.RD_OAUTH_STATE_FILE || 'oauth_token.json');

  // One-off token fallback (no refresh)
  const accessTokenFallback = env.RD_ACCESS_TOKEN || null;

  const requestDelayMs = toNum(cliArgs.delay ?? env.REQUEST_DELAY_MS, 250);
  const maxRetries = toNum(env.MAX_RETRIES, 5);

  const dryRun = toBool(cliArgs.dryRun ?? env.DRY_RUN, true);
  const verifyAfterUpdate = toBool(env.VERIFY_AFTER_UPDATE, false);

  const reportDir = path.resolve(process.cwd(), 'reports');
  const stateFile = path.resolve(process.cwd(), 'state.json');

  const pipelineAtualIncludeFunil = toBool(env.PIPELINE_ATUAL_INCLUDE_FUNIL, false);
  const mergeMultiSelect = toBool(env.MERGE_MULTI_SELECT, true);

  const paginationMode = String(env.PAGINATION_MODE || 'jsonapi'); // jsonapi | page_limit
  const pageSize = toNum(env.PAGE_SIZE, 50);

  return {
    baseUrl,

    clientId,
    clientSecret,
    tokenUrl,
    oauthStateFile,
    accessTokenFallback,

    requestDelayMs,
    maxRetries,
    dryRun,
    verifyAfterUpdate,

    reportDir,
    stateFile,

    pipelineAtualIncludeFunil,
    mergeMultiSelect,

    paginationMode,
    pageSize,
  };
}
