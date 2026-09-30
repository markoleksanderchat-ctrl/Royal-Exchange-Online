# Royal Exchange Online

A continuously running fictional stock exchange for the Royal Exchange system.

The persistent clearing engine runs a shared five-minute auction. Rule-based merchant houses, guild funds, factors, speculators, and market makers submit buy and sell limits; matched orders set prices and create volume. Slowly changing issuer fundamentals, supply and demand, liquidity, momentum, shared conditions, and persistent market notices shape those decisions. The responsive dashboard presents the RXC Composite, 38 listed guild issuers, bid/ask quotes, matched volume, recorded `1D`, `7D`, `30D`, and all-time charts, movers, and individual Minecraft item coverage.

`GET /api/market` returns the same public snapshot used by the site. Minecraft integration is intentionally one-way: the mod reads this market, but gameplay never changes it.

`GET /api/assistant` returns a compact read-only snapshot for ChatGPT actions. Optional `identifier`, `query`, and `historyPoints` parameters provide focused issuer, search, lore, and history responses without sending the full ledger.

`GET /api/v1/overview`, `/search`, `/issuers/{identifier}`, `/compare`, `/notices`, and `/wares` provide explicit ChatGPT operations with versioned metadata, structured errors, ambiguity handling, and server-calculated `1h`, `6h`, `24h`, `7d`, `30d`, or all-time issuer performance. The legacy assistant endpoint remains available.

`GET /openapi.json` publishes the OpenAPI 3.1 schema for the Royal Exchange GPT Action.

`POST /mcp` is the public, read-only Streamable HTTP MCP endpoint for ChatGPT and other MCP clients. It exposes focused tools for market summaries, issuer search, quotes and lore, comparisons, notices, and Minecraft ware-to-issuer lookup. The endpoint reads the same market ledger as the site and cannot place trades or write gameplay data.

## Validation

Use Node.js 22.13 or newer. Run `npm ci` to install the dependencies locked in `package-lock.json`, then:

```text
npm test
npm run lint
npx tsc --noEmit
```

## GitHub preparation

Keep this repository separate from Colony System, which contains Colony Bridge and the Royal Exchange Minecraft mod. Preserve source, native item assets, tests, migrations, dependency locks, Worker configuration and AGENTS.md. Credentials, `.dev.vars`, `.env` files, local databases, caches and generated `dist/` files stay local and ignored.

GitHub upload is deferred until the user explicitly requests it. Preserve existing history and upload the current main branch to the user-approved repository when access returns. Do not create automatic deployment workflows as part of the upload.

The public site currently runs on Cloudflare using `wrangler.production.json`; keep its custom domains, D1 binding and five-minute cron schedule intact. The separate `.openai/hosting.json` configuration is also preserved. Uploading source to GitHub does not deploy either site or modify the live market ledger. Deployment credentials and production data are provisioned separately when an actual deployment is requested.
