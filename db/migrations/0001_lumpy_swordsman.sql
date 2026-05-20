CREATE TABLE `settlement_interpretations` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`confirmed_deal_terms_json` text NOT NULL,
	`divergence_log_json` text NOT NULL,
	`ambiguity_resolutions_json` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`confirmed_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE no action
);
