import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';

/**
 * OAuth token manager:
 * - Reads JSON state file (access_token/refresh_token/expires_at)
 * - Refreshes when expiring (or on 401)
 * - Persists new token state back to JSON file
 */
export function createOauthManager(cfg) {
  let oauthState = loadOauthState();
  let refreshInFlight = null;

  function loadOauthState() {
    if (!cfg.oauthStateFile) return null;
    if (!fs.existsSync(cfg.oauthStateFile)) return null;

    try {
      const raw = fs.readFileSync(cfg.oauthStateFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveOauthState(next) {
    oauthState = next;
    fs.writeFileSync(cfg.oauthStateFile, JSON.stringify(next, null, 2));
  }

  async function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      if (!cfg.clientId || !cfg.clientSecret) {
        throw new Error('Missing RD_CLIENT_ID or RD_CLIENT_SECRET in .env (required to refresh OAuth token).');
      }

      const refreshToken = oauthState?.refresh_token;
      if (!refreshToken) {
        throw new Error(`Missing refresh_token in ${path.basename(cfg.oauthStateFile)}.`);
      }

      const body = new URLSearchParams();
      body.set('client_id', cfg.clientId);
      body.set('client_secret', cfg.clientSecret);
      body.set('refresh_token', refreshToken);
      body.set('grant_type', 'refresh_token');

      const res = await axios.post(cfg.tokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30_000,
      });

      const data = res?.data || {};
      const accessToken = data.access_token;
      const newRefreshToken = data.refresh_token || refreshToken;
      const expiresIn = Number(data.expires_in || oauthState?.expires_in || 7200);
      const tokenType = data.token_type || oauthState?.token_type || 'bearer';

      if (!accessToken) {
        throw new Error(`Token refresh did not return access_token. response=${JSON.stringify(data)}`);
      }

      const next = {
        ...oauthState,
        access_token: accessToken,
        refresh_token: newRefreshToken,
        token_type: tokenType,
        expires_in: expiresIn,
        expires_at: Date.now() + expiresIn * 1000,
        updated_at: new Date().toISOString(),
      };

      saveOauthState(next);
      console.log(`[oauth] refreshed token. expires_in=${expiresIn}s state_file=${path.basename(cfg.oauthStateFile)}`);

      return next.access_token;
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  }

  async function getValidAccessToken({ forceRefresh = false } = {}) {
    // If we have a fixed token and no oauth state file, just use it.
    if (!cfg.oauthStateFile && cfg.accessTokenFallback) return cfg.accessTokenFallback;

    oauthState = oauthState || loadOauthState();

    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;

    const hasToken = Boolean(oauthState?.access_token);
    const expiresAt = Number(oauthState?.expires_at || 0);
    const expiringSoon = hasToken && expiresAt && (expiresAt - now) <= fiveMin;

    if (forceRefresh || !hasToken || expiringSoon) {
      // If we can't refresh, fallback to fixed token (if present)
      if (!cfg.clientId || !cfg.clientSecret || !oauthState?.refresh_token) {
        if (cfg.accessTokenFallback) return cfg.accessTokenFallback;
        throw new Error('OAuth token missing/expired and refresh is not configured.');
      }
      await refreshAccessToken();
    }

    if (!oauthState?.access_token) {
      if (cfg.accessTokenFallback) return cfg.accessTokenFallback;
      throw new Error('Missing access token (set RD_ACCESS_TOKEN or configure oauth_token.json + client_id/client_secret).');
    }

    return oauthState.access_token;
  }

  return { getValidAccessToken };
}
