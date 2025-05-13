CREATE TABLE `rate_limits_user` (
	`user_id` integer NOT NULL,
	`api_type` text NOT NULL,
	`window_start_time` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`user_id`, `api_type`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text,
	`email` text,
	`image` text,
	`first_login` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`last_login` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`language` text DEFAULT 'en'
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_user_window` ON `rate_limits_user` (`user_id`,`api_type`,`window_start_time`);--> statement-breakpoint
CREATE INDEX `idx_users_last_login` ON `users` (`last_login`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_provider_id_idx` ON `users` (`provider_id`,`provider`);