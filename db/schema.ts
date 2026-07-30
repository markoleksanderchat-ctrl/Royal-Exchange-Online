import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const marketTicks = sqliteTable("market_ticks", {
  tick: integer("tick").primaryKey(),
  observedAt: text("observed_at").notNull(),
  composite: real("composite").notNull(),
  totalVolume: integer("total_volume").notNull(),
  modelVersion: text("model_version").notNull(),
  eventJson: text("event_json").notNull(),
  recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const issuerTicks = sqliteTable("issuer_ticks", {
  tick: integer("tick").notNull(),
  ticker: text("ticker").notNull(),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  influence: text("influence").notNull(),
  observedAt: text("observed_at").notNull(),
  price: real("price").notNull(),
  volume: integer("volume").notNull(),
}, (table) => [
  primaryKey({ columns: [table.tick, table.ticker] }),
  index("issuer_ticks_ticker_tick_idx").on(table.ticker, table.tick),
  index("issuer_ticks_observed_at_idx").on(table.observedAt),
]);
