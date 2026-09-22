import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/upstream-header-sanitizer.ts";

function transform(upstreamRequest) {
  return createGatewayPlugin().providerHooks.reduce((request, hook) =>
    hook.transformRequest({ upstreamRequest: request }).value, upstreamRequest);
}

test("Copilot reasoning models get max_tokens renamed to max_completion_tokens on the local bridge", () => {
  for (const model of ["gpt-5.4", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.3-codex", "gpt-41-copilot", "mai-code-1.1-flash"]) {
    const request = {
      url: "http://127.0.0.1:4141/v1/chat/completions", headers: {},
      body: { model, max_tokens: 16, messages: [{ role: "user", content: "hi" }] }
    };
    const result = transform(request);
    assert.equal(result.body.max_tokens, undefined);
    assert.equal(result.body.max_completion_tokens, 16);
    assert.deepEqual(result.body.messages, request.body.messages);
    assert.equal(request.body.max_tokens, 16, "input request must not be mutated");
  }
});

test("Copilot reasoning token param rewrite also applies to direct (non-bridged) githubcopilot.com hosts", () => {
  for (const url of [
    "https://api.githubcopilot.com/v1/chat/completions",
    "https://api.business.githubcopilot.com/v1/chat/completions",
    "http://localhost:4141/v1/chat/completions"
  ]) {
    const request = { url, headers: {}, body: { model: "gpt-5.4", max_tokens: 16 } };
    assert.equal(transform(request).body.max_completion_tokens, 16);
  }
});

test("Copilot reasoning token param rewrite does not touch unrelated models or hosts", () => {
  const body = { model: "gpt-5.4", max_tokens: 16 };
  const request = { url: "http://127.0.0.1:4141/v1/chat/completions", headers: {}, body };
  for (const input of [
    { ...request, body: { ...body, model: "claude-sonnet-5" } },
    { ...request, body: { ...body, model: "gpt-5-mini" } },
    { ...request, url: "http://127.0.0.1:4141/v1/responses" },
    { ...request, url: "http://example.test/v1/chat/completions" },
    { ...request, body: { ...body, max_completion_tokens: 16 } },
    { ...request, body: { model: body.model } },
    { ...request, bodyEncoding: "text", body: JSON.stringify(body) }
  ]) {
    assert.deepEqual(transform(input).body, input.body);
  }
});
