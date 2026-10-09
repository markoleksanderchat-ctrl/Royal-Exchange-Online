# Scheduled exchange, trading era 1

The site has 38 simulated securities and a browser-local watchlist. It has no
stock positions, cash accounts or executed player transactions to liquidate.
The reset preserves watchlists, themes, issuer identities and item mappings.
Only exchange-owned prices, history, volumes, notices and simulation state are
reset. Starting prices use the established catalog valuations, with RXC at 1,000.

Trading uses America/New_York, 9:30–16:00 on NYSE trading weekdays, 13:00 on
scheduled early closes. Recurring holidays and DST are evaluated independently
of the simulation. The calendar is verified against the published 2026–2028
[NYSE schedule](https://www.nyse.com/trade/hours-calendars). Unscheduled closures
or later rule changes require a calendar source update; `sessionFor` accepts
explicit overrides for such updates. The five-minute cron remains installed but
cannot clear outside a session. SQLite checks the closing boundary inside the
atomic transaction as well as the application checking before simulation.

Each observed auction advances persisted order flow, variance and issuer
fundamentals. Reopening news uses deterministic shared, sector and issuer factors
scaled by volatility and closure length. Opening executions are bounded to 3.5%
of the previous close; the gap is applied once on the first observed auction of
a session. No missing auctions, volume or historical points are backfilled.
The first era opening starts at the catalog baseline without a legacy gap.

Prices and the latest intraday chart freeze after closing. Immutable
`market_sessions` records retain the complete observed daily history, opens,
closes, high/low, volume and previous closes. If publication was interrupted,
the snapshot is recovered from the last committed auction before archiving it.
A single baseline observation displays honestly until trading begins.

## Operator activation and recovery

Activation is manual, separate from applying the additive schema or deploying
ordinary code. Never leave the activation variable in the final deployment.

1. Record the currently deployed Worker version. Export the complete production
   D1 database outside Git using Wrangler. Restore it into isolated SQLite,
   verify integrity, all tables and the 38 issuer states, and record its SHA-256.
2. Apply `drizzle/0004_scheduled_market.sql`. Deploy the candidate without
   `MARKET_RESET_BACKUP_SHA256`. Missing era metadata freezes the legacy cache;
   it never automatically resets on an ordinary deployment or restart.
3. Confirm the legacy tick and prices have stopped. Export this frozen database
   again, restore and verify it, and retain the file and SHA-256 as the final
   pre-reset rollback. Preserve both exports and the previous Worker version.
4. Deploy the exact validated candidate with the operator variable
   `MARKET_RESET_BACKUP_SHA256` set to the verified frozen export digest. On the
   first request or cron the Worker performs the guarded reset in one D1 batch.
   Failure rolls back all reset statements. The immutable era marker, backup
   digest and timestamp are inserted last. Concurrent requests and retries
   cannot reset the same era twice. This flag cannot be supplied by HTTP clients.
5. Confirm the 38 catalog prices, RXC 1,000, zero volume/trades and fresh baseline
   while closed. Deploy again immediately without the activation variable.
   Confirm the variable is absent, the era receipt survives and prices remain
   fixed. Normal deployments must always omit the variable.

Missing established data fails closed and requires explicit operator recovery;
it does not silently recreate an era. Recovery requires halting writers,
restoring the complete verified SQL export (including removal of era/session
guards by the operator), and restoring the compatible Worker version. Never
roll an old writer back against an active new era: database guards reject it.
Recovery is a separate explicit operator action, never a normal restart.

No Minecraft save, inventory, bank account or installed mod is touched by this
website migration. Minecraft continues to consume the public feed one way.
