import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("mcp-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

let requestId = 0;

async function mcpRequest(method, params = {}) {
  const app = await worker();
  const response = await app.fetch(new Request("https://royalexchange.net/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Host: "royalexchange.net",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  }), environment, context);
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.match(response.headers.get("access-control-allow-origin") ?? "", /^\*$/);
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const data = body.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6);
    assert.ok(data, "MCP SSE response did not contain a data frame");
    return JSON.parse(data);
  }
  return JSON.parse(body);
}

test("publishes the Royal Exchange MCP identity and read-only tools", async () => {
  const initialized = await mcpRequest("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "royal-exchange-tests", version: "1.0.0" },
  });
  assert.equal(initialized.result.serverInfo.name, "Royal Exchange");

  const listed = await mcpRequest("tools/list");
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    "get_market_overview",
    "search_market",
    "get_issuer",
    "compare_issuers",
    "get_market_notices",
    "find_minecraft_wares",
  ]);
  for (const tool of listed.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
  }
});

test("answers market, lore, comparison, and Minecraft ware tool calls", async () => {
  const overview = await mcpRequest("tools/call", { name: "get_market_overview", arguments: {} });
  assert.equal(overview.result.structuredContent.exchange, "Royal Exchange");
  assert.equal(overview.result.structuredContent.listedIssuers, 38);

  const issuer = await mcpRequest("tools/call", {
    name: "get_issuer",
    arguments: { identifier: "WIRE", historyPoints: 12 },
  });
  assert.equal(issuer.result.structuredContent.issuer.ticker, "WIRE");
  assert.match(issuer.result.structuredContent.issuer.charter.register, /^RXC-WIRE$/);

  const comparison = await mcpRequest("tools/call", {
    name: "compare_issuers",
    arguments: { identifiers: ["WIRE", "IRON"] },
  });
  assert.deepEqual(comparison.result.structuredContent.comparison.map((company) => company.ticker), ["WIRE", "IRON"]);

  const wares = await mcpRequest("tools/call", {
    name: "find_minecraft_wares",
    arguments: { query: "redstone", limit: 5 },
  });
  assert.ok(wares.result.structuredContent.matches.length > 0);
  assert.ok(wares.result.structuredContent.matches.every((item) => item.registryId.startsWith("minecraft:")));
});
