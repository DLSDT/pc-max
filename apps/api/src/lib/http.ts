interface Meta {
  page: number;
  limit: number;
  total: number;
}

/** Build the standard success envelope (with pagination meta). */
export function ok<T>(data: T, meta: Meta): { data: T; meta: Meta };
/** Build the standard success envelope (no meta). */
export function ok<T>(data: T): { data: T };
export function ok<T>(data: T, meta?: Meta) {
  return meta ? { data, meta } : { data };
}

export function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total };
}
