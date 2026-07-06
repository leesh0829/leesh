import { fetchWithTimeout } from "./fetchWithTimeout";

const KIS_FETCH_TIMEOUT_MS = 8_000;

export function fetchKis(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  return fetchWithTimeout(input, init ?? {}, {
    timeoutMs: KIS_FETCH_TIMEOUT_MS,
  });
}
