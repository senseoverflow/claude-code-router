import { isRecord } from "@ccr/core/gateway/internal/value";

type UpstreamRequest = {
  body?: unknown;
  bodyEncoding?: "bytes" | "form" | "json" | "none" | "text";
  url: string;
};

/**
 * GitHub Copilot's chat/completions backend rejects these model ids with a
 * bare `400 Bad Request` when the request carries `max_tokens`, and only
 * accepts `max_completion_tokens` instead (unlike e.g. claude-sonnet-5,
 * gemini-3.7-flash or gpt-5-mini on the same endpoint, which accept
 * `max_tokens` and error with "max_tokens and max_completion_tokens cannot
 * both be set" if both are present). CCR's OpenAI chat-completions transformer
 * always emits `max_tokens`, so requests to these models fail outright unless
 * rewritten here before they leave the process.
 */
const COPILOT_MAX_COMPLETION_TOKENS_ONLY_MODELS = new Set([
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-41-copilot",
  "mai-code-1.1-flash"
]);

const copilotChatCompletionsHostPattern = /^(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)*githubcopilot\.com)$/i;
const copilotChatCompletionsPathPattern = /^(?:\/v1)?\/chat\/completions\/?$/;

export function applyCopilotReasoningTokenParam<T extends UpstreamRequest>(request: T): T {
  if ((request.bodyEncoding ?? "json") !== "json" || !isRecord(request.body)) {
    return request;
  }
  const body = request.body;
  if (typeof body.model !== "string" || !COPILOT_MAX_COMPLETION_TOKENS_ONLY_MODELS.has(body.model)) {
    return request;
  }
  if (!("max_tokens" in body) || "max_completion_tokens" in body) {
    return request;
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return request;
  }
  if (!copilotChatCompletionsHostPattern.test(url.hostname) || !copilotChatCompletionsPathPattern.test(url.pathname)) {
    return request;
  }
  const { max_tokens: maxTokens, ...rest } = body;
  const next = { ...rest, max_completion_tokens: maxTokens };
  return { ...request, body: next };
}
