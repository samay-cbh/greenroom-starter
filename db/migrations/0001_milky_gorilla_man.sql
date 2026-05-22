CREATE TABLE `deal_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_email_text` text NOT NULL,
	`source_email_hash` text NOT NULL,
	`extracted_json` text NOT NULL,
	`ambiguities_json` text,
	`contradictions_json` text,
	`embedding_blob` blob,
	`confirmed_at` integer,
	`confirmed_via` text,
	`agent_reply_text` text,
	`created_at` integer NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
