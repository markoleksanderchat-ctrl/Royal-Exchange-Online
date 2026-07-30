CREATE TABLE `market_anomaly_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`next_anomaly_at` integer NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "market_anomaly_state_singleton" CHECK (`id` = 1)
);
--> statement-breakpoint
CREATE TABLE `market_anomalies` (
	`id` text PRIMARY KEY NOT NULL,
	`template_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tone` text NOT NULL,
	`severity` text NOT NULL,
	`sector` text NOT NULL,
	`affected_tickers` text NOT NULL,
	`peak_impact_percent` real NOT NULL,
	`shape` text NOT NULL,
	`started_at` integer NOT NULL,
	`peaks_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_anomalies_window_idx` ON `market_anomalies` (`started_at`,`ends_at`);
