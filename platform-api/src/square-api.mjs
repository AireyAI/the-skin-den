import { SQUARE_VERSION } from "./square-config.mjs";

/** A Square call that failed. `transient` means retrying later may succeed. */
export class SquareError extends Error {
  constructor(message, { status = 0, transient = false, code = "" } = {}) {
    super(message);
    this.name = "SquareError";
    this.status = status;
    this.transient = transient;
    this.code = code;
  }

  get unauthorised() {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * One request to Square. `token` sends a seller Bearer token; `clientAuth` sends the
 * application secret (only the revoke endpoint uses that). Tokens never reach logs.
 */
export async function squareRequest(cfg, path, { method = "GET", token, clientAuth = false, body, fetchImpl = fetch } = {}) {
  const headers = { "Square-Version": SQUARE_VERSION, Accept: "application/json" };
  if (clientAuth) headers.Authorization = `Client ${cfg.applicationSecret}`;
  else if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetchImpl(cfg.apiBase + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new SquareError("Square could not be reached. Try again in a moment.", { transient: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.errors?.[0]?.code || "";
    throw new SquareError("Square could not complete this request.", {
      status: res.status,
      transient: res.status >= 500 || res.status === 429,
      code
    });
  }
  return json;
}
