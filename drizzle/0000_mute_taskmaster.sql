CREATE TABLE `issuer_ticks` (
	`tick` integer NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`sector` text NOT NULL,
	`influence` text NOT NULL,
	`observed_at` text NOT NULL,
	`price` real NOT NULL,
	`volume` integer NOT NULL,
	PRIMARY KEY(`tick`, `ticker`)
);
--> statement-breakpoint
CREATE INDEX `issuer_ticks_ticker_tick_idx` ON `issuer_ticks` (`ticker`,`tick`);--> statement-breakpoint
CREATE INDEX `issuer_ticks_observed_at_idx` ON `issuer_ticks` (`observed_at`);--> statement-breakpoint
CREATE TABLE `market_ticks` (
	`tick` integer PRIMARY KEY NOT NULL,
	`observed_at` text NOT NULL,
	`composite` real NOT NULL,
	`total_volume` integer NOT NULL,
	`model_version` text NOT NULL,
	`event_json` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
