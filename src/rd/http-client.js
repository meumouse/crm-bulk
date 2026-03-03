import axios from 'axios';
import { sleep } from '../core/sleep.js';

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

export async function requestWithRetry(cfg, fn, tag) {
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;

    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      const retryable = !status || status >= 500 || status === 429;

      if (!retryable || attempt >= cfg.maxRetries) {
        throw enrichAxiosError(err, tag);
      }

      const retryAfter = err?.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 0;

      const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
      const jitterMs = Math.floor(Math.random() * 250);
      const wait = Math.max(retryAfterMs, backoffMs + jitterMs);

      console.warn(`[retry] ${tag} attempt=${attempt} status=${status} wait=${wait}ms`);
      await sleep(wait);
    }
  }
}

export function createHttpClient(cfg, oauth) {
  const http = axios.create({
    baseURL: cfg.baseUrl,
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  http.interceptors.request.use(async (config) => {
    const token = await oauth.getValidAccessToken();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  http.interceptors.response.use(
    (res) => res,
    async (err) => {
      const status = err?.response?.status;
      if (status === 401 && err?.config && !err.config.__retried401) {
        err.config.__retried401 = true;
        await oauth.getValidAccessToken({ forceRefresh: true });
        return http.request(err.config);
      }
      return Promise.reject(err);
    }
  );

  return http;
}
