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
]);

export const marketSnapshot = sqliteTable("market_snapshot", {
  id: integer("id").primaryKey(),
  tick: integer("tick").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
});

export const marketAnomalyState = sqliteTable("market_anomaly_state", {
  id: integer("id").primaryKey(),
  nextAnomalyAt: integer("next_anomaly_at").notNull(),
  generation: integer("generation").notNull().default(0),
});

export const marketAnomalies = sqliteTable("market_anomalies", {
  id: text("id").primaryKey(),
  templateKey: text("template_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  tone: text("tone").notNull(),
  severity: text("severity").notNull(),
  sector: text("sector").notNull(),
  affectedTickers: text("affected_tickers").notNull(),
  peakImpactPercent: real("peak_impact_percent").notNull(),
  shape: text("shape").notNull(),
  startedAt: integer("started_at").notNull(),
  peaksAt: integer("peaks_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("market_anomalies_ends_at_idx").on(table.endsAt)]);

export const issuerMarketState = sqliteTable("issuer_market_state", {
  ticker: text("ticker").primaryKey(),
  lastTick: integer("last_tick").notNull(),
  lastPrice: real("last_price").notNull(),
  fairValue: real("fair_value").notNull(),
  earningsIndex: real("earnings_index").notNull(),
  bookValueIndex: real("book_value_index").notNull(),
  debtRatio: real("debt_ratio").notNull(),
  dividendYield: real("dividend_yield").notNull(),
  demandIndex: real("demand_index").notNull(),
  supplyIndex: real("supply_index").notNull(),
  momentum: real("momentum").notNull(),
  volatility: real("volatility").notNull(),
  marketMakerInventory: integer("market_maker_inventory").notNull(),
  sessionDay: text("session_day").notNull(),
  sessionOpen: real("session_open").notNull(),
  sessionHigh: real("session_high").notNull(),
  sessionLow: real("session_low").notNull(),
  sessionVolume: integer("session_volume").notNull(),
  previousClose: real("previous_close").notNull(),
  totalTrades: integer("total_trades").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const marketTradeTicks = sqliteTable("market_trade_ticks", {
  tick: integer("tick").notNull(),
  ticker: text("ticker").notNull(),
  observedAt: text("observed_at").notNull(),
  price: real("price").notNull(),
  bid: real("bid").notNull(),
  ask: real("ask").notNull(),
  quantity: integer("quantity").notNull(),
  notional: real("notional").notNull(),
  tradeCount: integer("trade_count").notNull(),
  buyerMix: text("buyer_mix").notNull(),
  sellerMix: text("seller_mix").notNull(),
  fairValue: real("fair_value").notNull(),
  earningsIndex: real("earnings_index").notNull(),
  demandIndex: real("demand_index").notNull(),
  supplyIndex: real("supply_index").notNull(),
  sessionDay: text("session_day").notNull(),
  sessionOpen: real("session_open").notNull(),
  sessionHigh: real("session_high").notNull(),
  sessionLow: real("session_low").notNull(),
  sessionVolume: integer("session_volume").notNull(),
  previousClose: real("previous_close").notNull(),
}, (table) => [
  primaryKey({ columns: [table.tick, table.ticker] }),
  index("market_trade_ticks_ticker_tick_idx").on(table.ticker, table.tick),
]);
