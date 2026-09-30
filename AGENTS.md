# Royal Exchange website

- Preserve the fictional Crown-market identity, current visual system and five destination pages: Overview, Markets, Price Book, My Ledger and Data.
- Preserve issuer/item mappings, five-minute clearing, recorded history, API contracts, search, sorting and local ledger storage. Do not invent or backfill recorded prices.
- The Minecraft integration remains one-way: the mod reads public market data; gameplay and trades never write back to the public exchange.
- Keep credentials, development overrides, generated builds, caches and runtime database files outside Git. Preserve source assets, migrations and dependency locks.
- Run the existing build/tests, TypeScript and lint checks for code changes. Verify visual changes in the rendered site at desktop and mobile widths.
- Do not push to GitHub, publish a release or deploy the site without the user's explicit instruction. Keep deployment manual; preserve production bindings and the existing hosting configuration.
- Keep progress updates and final responses concise.
