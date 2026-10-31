CREATE TABLE `events` (
	`stream_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`command_id` text NOT NULL,
	`command_hash` text NOT NULL,
	`type` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`stream_id`) REFERENCES `streams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_sequence` ON `events` (`stream_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_idempotency` ON `events` (`stream_id`,`command_id`);--> statement-breakpoint
CREATE TABLE `quotas` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `streams` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "revision_range" CHECK("streams"."revision" BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streams_token_hash_unique` ON `streams` (`token_hash`);--> statement-breakpoint
CREATE INDEX `stream_expiry` ON `streams` (`expires_at`);
--> statement-breakpoint
CREATE TRIGGER event_guard BEFORE INSERT ON events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM streams WHERE id=NEW.stream_id AND revision+1=NEW.sequence AND state=NEW.from_state) THEN RAISE(ABORT,'revision conflict') END;
END;
--> statement-breakpoint
CREATE TRIGGER event_projection AFTER INSERT ON events BEGIN
 UPDATE streams SET state=NEW.to_state,revision=NEW.sequence WHERE id=NEW.stream_id;
END;
--> statement-breakpoint
CREATE TRIGGER event_immutable BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'events are immutable'); END;
