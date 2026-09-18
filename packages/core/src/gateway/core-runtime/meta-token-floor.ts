import { isRecord } from "@ccr/core/gateway/internal/value";

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  url: string;
};

type TokenFloorMatcher = {
  hostname: string;
  modelPattern: RegExp;
  pathPattern: RegExp;
};

const TOKEN_FLOOR_MATCHERS: TokenFloorMatcher[] = [
  {
    hostname: "openrouter.ai",
    modelPattern: /^meta\/muse-spark(?:-|$)/i,
    pathPattern: /^\/api\/v1\/(?:messages|responses|chat\/completions)\/?$/
  },
  {
    hostname: "opencode.ai",
    modelPattern: /^muse-spark(?:-|$)/i,
    pathPattern: /^\/zen\/go\/v1(?:\/|$)/
  }
];

export function applyMetaTokenFloor<T extends UpstreamRequest>(request: T): T {
  if ((request.bodyEncoding ?? "json") !== "json" || !isRecord(request.body)) {
    return request;
  }
  const body = request.body;
  if (typeof body.model !== "string") {
    return request;
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return request;
  }
  if (url.protocol !== "https:") {
    return request;
  }
  const matched = TOKEN_FLOOR_MATCHERS.some((matcher) =>
    matcher.hostname === url.hostname && matcher.pathPattern.test(url.pathname) && matcher.modelPattern.test(body.model as string));
  if (!matched) {
    return request;
  }
  let next = body;
  for (const field of ["max_tokens", "max_completion_tokens", "max_output_tokens"]) {
    const value = body[field];
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 16) {
      next = { ...next, [field]: 16 };
    }
  }
  return next === body ? request : { ...request, body: next };
}
