/**
 * Shared pagination helpers for API list endpoints.
 *
 * Contract:
 * - Callers opt in by sending `?page=<n>`.
 * - When `page` is absent, endpoints keep their legacy array-shaped
 *   response (important — existing frontend clients expect arrays).
 * - When `page` is present, endpoints return:
 *     { data: T[], pagination: { page, pageSize, total, totalPages } }
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  /** True when caller opted in via ?page=<n>. */
  paginated: boolean;
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Parse `?page` and `?pageSize` from a URL's search params.
 * Returns `paginated: false` when the caller did not pass `page` —
 * in that case `skip/take` are still usable defaults.
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawPage = searchParams.get("page");
  const rawSize = searchParams.get("pageSize");
  const paginated = rawPage !== null;

  let page = parseInt(rawPage ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = parseInt(rawSize ?? String(DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return {
    paginated,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginationMeta(params: PaginationParams, total: number): PaginationMeta {
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
