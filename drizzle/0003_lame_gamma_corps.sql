CREATE TABLE `sync_stats` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`deleted` integer NOT NULL,
	`total` integer NOT NULL
);
