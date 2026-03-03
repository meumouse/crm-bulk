import { requestWithRetry } from './http-client.js';

function extractArray(obj, keys) {
  for (const k of keys) {
    if (Array.isArray(obj?.[k])) return obj[k];
  }
  return null;
}

function extractNextPageUrl(data) {
  const next =
    data?.meta?.next_page ||
    data?.next_page ||
    data?.links?.next ||
    data?.paging?.next ||
    null;

  if (!next) return null;
  if (typeof next !== 'string') return null;

  let rel = next;

  if (rel.startsWith('http')) {
    try {
      const u = new URL(rel);
      rel = u.pathname + u.search;
    } catch {
      return null;
    }
  }

  // Safety: keep inside CRM v2
  if (!rel.startsWith('/crm/v2/')) return null;
  return rel;
}

/**
 * Iterates through deals using:
 * - page[number]/page[size] by default
 * - optional "next page url" if API returns links/meta
 *
 * This iterator intentionally yields "light" deal objects from list endpoint
 * to keep calls bounded. If you need full fields, call rd.getDeal(dealId).
 */
export async function* iterateDeals(cfg, rd) {
  const pageSize = cfg.pageSize;
  let pageNumber = 1;
  let nextUrl = null;
  let safety = 0;

  while (safety < 100000) {
    safety++;

    const data = await requestWithRetry(cfg, async () => {
      if (nextUrl) {
        const res = await rd._http.get(nextUrl);
        return res.data;
      }
      return rd.listDealsPage({ pageNumber, pageSize });
    }, `listDeals:${nextUrl ? 'nextUrl' : `page=${pageNumber}`}`);

    const deals = extractArray(data, ['deals', 'data', 'items']) || [];
    for (const d of deals) yield d;

    const computedNextUrl = extractNextPageUrl(data);
    if (computedNextUrl) {
      nextUrl = computedNextUrl;
      if (!deals.length) break;
      continue;
    }

    if (deals.length < pageSize) break;
    pageNumber++;
  }
}
