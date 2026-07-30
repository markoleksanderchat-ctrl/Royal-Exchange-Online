# Royal Exchange Online

A continuously running fictional stock exchange for the Royal Exchange system.

The autonomous wall-clock engine publishes a new shared market tick every minute. The responsive dashboard presents the RCX Composite, 38 listed guild issuers, live market breadth, persistent randomly scheduled anomalies, 24-hour charts, volume, movers, and individual Minecraft item coverage.

`GET /api/market` returns the same public snapshot used by the site. Minecraft integration is intentionally one-way: the mod may read this market later, but gameplay never changes it.

## Validation

```text
vinext build
node --test tests/*.test.mjs
npx eslint app worker lib tests
```
