export * from './enums';
export * from './game';
export * from './optimization';
export * from './taxonomy';
export * from './auth';
export * from './system';
export * from './analytics';

/** Standard API error envelope. */
export const ApiError = {
  code: '',
  message: '',
  details: null as unknown,
};
export type ApiErrorEnvelope = typeof ApiError;

/** Generic pagination meta used by admin list endpoints. */
export const PaginationMeta = {
  page: 1,
  limit: 24,
  total: 0,
};
export type PaginationMeta = typeof PaginationMeta;
