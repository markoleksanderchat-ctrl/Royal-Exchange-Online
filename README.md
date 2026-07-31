# Royal Exchange Online

A continuously running fictional stock exchange for the Royal Exchange system.

The autonomous wall-clock engine publishes a new shared market tick every minute. The responsive dashboard presents the RCX Composite, 38 listed guild issuers, live market breadth, persistent randomly scheduled anomalies, 24-hour charts, volume, movers, and individual Minecraft item coverage.

`GET /api/market` returns the same public snapshot used by the site. Minecraft integration is intentionally one-way: the mod may read this market later, but gameplay never changes it.

`GET /api/assistant` returns a compact read-only snapshot for ChatGPT actions. Optional `identifier`, `query`, and `historyPoints` parameters provide focused issuer, search, lore, and history responses without sending the full ledger.

`GET /api/v1/overview`, `/search`, `/issuers/{identifier}`, `/compare`, `/notices`, and `/wares` provide explicit ChatGPT operations with versioned metadata, structured errors, ambiguity handling, and server-calculated `1h`, `6h`, `24h`, or `7d` issuer performance. The legacy assistant endpoint remains available.

`GET /openapi.json` publishes the OpenAPI 3.1 schema for the Royal Exchange GPT Action.

`POST /mcp` is the public, read-only Streamable HTTP MCP endpoint for ChatGPT and other MCP clients. It exposes focused tools for market summaries, issuer search, quotes and lore, comparisons, notices, and Minecraft ware-to-issuer lookup. The endpoint reads the same market ledger as the site and cannot place trades or write gameplay data.

## Validation

```text
vinext build
node --test tests/*.test.mjs
npx eslint app worker lib tests
```
