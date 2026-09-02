CREATE TABLE IF NOT EXISTS `issuer_market_state` (
	`ticker` text PRIMARY KEY NOT NULL,
	`last_tick` integer NOT NULL,
	`last_price` real NOT NULL,
	`fair_value` real NOT NULL,
	`earnings_index` real NOT NULL,
	`book_value_index` real NOT NULL,
	`debt_ratio` real NOT NULL,
	`dividend_yield` real NOT NULL,
	`demand_index` real NOT NULL,
	`supply_index` real NOT NULL,
	`momentum` real NOT NULL,
	`volatility` real NOT NULL,
	`market_maker_inventory` integer NOT NULL,
	`session_day` text NOT NULL,
	`session_open` real NOT NULL,
	`session_high` real NOT NULL,
	`session_low` real NOT NULL,
	`session_volume` integer NOT NULL,
	`previous_close` real NOT NULL,
	`total_trades` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_trade_ticks` (
	`tick` integer NOT NULL,
	`ticker` text NOT NULL,
	`observed_at` text NOT NULL,
	`price` real NOT NULL,
	`bid` real NOT NULL,
	`ask` real NOT NULL,
	`quantity` integer NOT NULL,
	`notional` real NOT NULL,
	`trade_count` integer NOT NULL,
	`buyer_mix` text NOT NULL,
	`seller_mix` text NOT NULL,
	`fair_value` real NOT NULL,
	`earnings_index` real NOT NULL,
	`demand_index` real NOT NULL,
	`supply_index` real NOT NULL,
	`session_day` text NOT NULL,
	`session_open` real NOT NULL,
	`session_high` real NOT NULL,
	`session_low` real NOT NULL,
	`session_volume` integer NOT NULL,
	`previous_close` real NOT NULL,
	PRIMARY KEY(`tick`, `ticker`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_trade_ticks_ticker_tick_idx` ON `market_trade_ticks` (`ticker`,`tick`);

