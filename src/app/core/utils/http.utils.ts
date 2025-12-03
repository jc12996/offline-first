export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE'
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503
} as const;

export const MUTATION_METHODS = [HTTP_METHODS.POST, HTTP_METHODS.PUT, HTTP_METHODS.DELETE] as const;

export function isMutationMethod(method: string): boolean {
  return method === HTTP_METHODS.POST || method === HTTP_METHODS.PUT || method === HTTP_METHODS.DELETE;
}

export function isGetMethod(method: string): boolean {
  return method === HTTP_METHODS.GET;
}

export function isClientError(status: number): boolean {
  return status >= 400 && status < 500;
}

