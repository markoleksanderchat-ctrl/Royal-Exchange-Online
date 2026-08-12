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
