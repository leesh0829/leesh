export class FetchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

type FetchWithTimeoutOptions = {
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 8_000;

export async function fetchWithTimeout(
  input: FetchInput,
  init: FetchInit = {},
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;

  try {
    return await fetcher(input, { ...init, signal });
  } catch (error) {
    if (timedOut) throw new FetchTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
