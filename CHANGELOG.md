# Royal Exchange Online releases

## 0.1.0 — Initial GitHub source publication

- Publishes the existing live website source, including the persisted v5 clearing engine, weighted RXC Composite, financial chart presentation and all five market destinations.
- Includes NYSE trading hours, holidays, early closes and daylight saving changes; closed prices freeze, reopening gaps run once, and observed sessions survive restarts.
- Records the existing era-1 migration, established on October 9, 2026 after a verified full database backup. Source publication does not execute another reset or upload production data.
- Corrects the earlier README's continuous-trading and v4 descriptions. Production application code remains the validated `67ee318` implementation deployed as Worker `c69b39bf-68fb-4f72-a981-0333bbff9194`.
- Keeps manual Cloudflare deployment separate from GitHub publication and the Minecraft mod/Windows app release channels.

The website's version is independent of Colony Bridge 0.30.0 and Kingdom Chronicle 0.3.10. GitHub's source archives are the release downloads for this project; the running application is https://www.royalexchange.net.

## October 9, 2026 — Scheduled exchange and trading era 1

Published NYSE session scheduling, bounded reopening gaps, frozen closed-session prices and immutable daily archives. Activated era 1 once after a verified database export and restore check; preserved issuer identities and browser watchlists. Production model: `royal-exchange-clearing-v5`; application source: `67ee318`; Worker: `c69b39bf-68fb-4f72-a981-0333bbff9194`. All 41 tests, build, lint, typecheck and live desktop/mobile checks passed.

## October 2, 2026 — Intraday simulation and financial charts

Published persisted momentum, volatility clustering, uncommon shocks and weighted constituent RXC calculations. Refined the chart line, Eastern-time labels, price-axis scaling and previous-close reference while preserving the exchange styling. Application source: `5948602`; Worker: `39a2d89e-851e-4200-a7d1-75c516a15f79`. Existing recorded prices were retained.

## September 30, 2026 — Final professional polish

Published to [royalexchange.net](https://royalexchange.net/) and [www.royalexchange.net](https://www.royalexchange.net/).

- **More selective Overview:** four-row Official List and Price Book previews lead visitors to the full directories.
- **Cleaner public language:** exchange status, notices, history and ledger messages use concise visitor-facing copy.
- **Calmer ticker and highlights:** six unique quotes, keyboard access and mover columns that fill the available space.
- **Better small-screen spacing:** aligned status lines, a tidy masthead and no page overflow at 320 pixels.

All 28 tests, build, lint and TypeScript checks passed. Live checks passed for both domains, all destination pages, issuer details, APIs, sprites and every RXC history range. Desktop and mobile rendering verified with no browser errors.

Cloudflare version: `4bc24197-6a7c-4323-81bb-da89e2192a83`. Previous version retained for rollback: `ecfae855-801e-436a-b441-dc95d2ce645e`.

## September 30, 2026 — Institutional redesign and separate pages

Published to [royalexchange.net](https://royalexchange.net/) and [www.royalexchange.net](https://www.royalexchange.net/).

- **New institutional look:** forest green, warm ivory, restrained gold, clearer typography and fewer boxes, with a matching dark theme.
- **Five primary pages:** Overview, Markets, Price Book, My Ledger and Data, plus dedicated company detail pages.
- **Focused homepage:** RXC leads, followed by compact market highlights, notices and previews of the directories.
- **Recorded RXC chart:** a new read-only history endpoint uses existing recorded observations for 1D, 7D, 30D and ALL. No invented or backfilled prices.
- **Better directories:** searchable, filterable and sortable company tables; the full Price Book has native sprites for all 1,332 Minecraft items, trade filters and pagination.
- **Clearer company pages:** quotes, charts, trading statistics, principal wares, charters and Add to Ledger controls.
- **Personal watchlist and public data:** dedicated pages retain local-device privacy and explain the simulation, clearing and APIs.
- **Mobile and keyboard polish:** narrow navigation, prioritized table columns, clear focus states and chart inspection that fits smaller screens.

Build, lint and TypeScript checks passed; all 28 automated tests passed. Live checks passed for both public domains, all primary routes, company details, native sprites, existing APIs and all RXC history ranges. No browser errors were observed.

Market pricing, five-minute clearing, issuer/item mappings and existing API behavior remain unchanged. No new dependencies or database migrations.

Cloudflare version: `ecfae855-801e-436a-b441-dc95d2ce645e`.

## September 29, 2026 — Website redesign

Published to [royalexchange.net](https://royalexchange.net/) and [www.royalexchange.net](https://www.royalexchange.net/).

### What changed

- **Cleaner exchange dashboard.** The site now uses a more consistent navy, brass, and cream design, clearer type, a new RX mark, and better spacing. The layout also adapts more cleanly to phones and smaller screens.
- **Market breadth at a glance.** A colored bar shows the balance of advancing, declining, and unchanged companies beside the existing counts.
- **More useful market movers.** Switch between top gainers, top decliners, and the most actively traded companies. Selecting a company opens its quote in the main panel.
- **Easier company browsing.** Search the official list, narrow it by trade sector, and sort by company name, latest price, price change, or volume. The list shows how many companies match the current filters.
- **Clearer chart status.** When only one recorded auction is available, the page says that the first observation has been recorded and waits for another before showing a performance change. It no longer presents a one-point change as meaningful history.

### Checks

- Build, lint, and TypeScript checks passed; all 23 automated tests passed.
- After publication, the live site showed the new controls and loaded recorded market history without browser errors. Both public domains served the redesign.

This release changes the public website. It does not change the exchange's market rules or the Minecraft mod.
