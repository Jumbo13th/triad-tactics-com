export type Migration = {
	id: number;
	name: string;
	up: string;
};

export const migrations: Migration[] = [
	{
		id: 1,
		name: 'initial_schema',
		up: `
			CREATE TABLE IF NOT EXISTS applications (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL,
				steamid64 TEXT NOT NULL,
				persona_name TEXT,
				answers TEXT NOT NULL,
				ip_address TEXT,
				locale TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS steam_sessions (
				id TEXT PRIMARY KEY,
				redirect_path TEXT NOT NULL,
				steamid64 TEXT,
				persona_name TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
			CREATE INDEX IF NOT EXISTS idx_applications_steamid64 ON applications(steamid64);
			CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);
			CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON steam_sessions(created_at);
		`
	},
	{
		id: 2,
		name: 'unique_steamid64',
		up: `
			-- Enforce one application per Steam account.
			-- If historical duplicates exist, keep the earliest submission and remove the rest.
			DELETE FROM applications
			WHERE id NOT IN (
				SELECT MIN(id)
				FROM applications
				GROUP BY steamid64
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_steamid64_unique
			ON applications(steamid64);
		`
	},
	{
		id: 3,
		name: 'answers_verified_game_access',
		up: `
			-- Migrate legacy Steam verification fields in answers JSON:
			-- - infer verified_game_access=true when legacy indicates verification
			-- - remove legacy keys (arma_reforger_owned, ownership_check)
			-- Guard with json_valid() to avoid failing if any corrupted rows exist.
			UPDATE applications
			SET answers = json_remove(
				CASE
					WHEN json_type(answers, '$.verified_game_access') IS NULL
						AND (
							json_extract(answers, '$.arma_reforger_owned') = 1
							OR json_extract(answers, '$.ownership_check') = 'verified'
						)
					THEN json_set(answers, '$.verified_game_access', 1)
					ELSE answers
				END,
				'$.arma_reforger_owned',
				'$.ownership_check'
			)
			WHERE json_valid(answers) = 1
				AND (
					json_type(answers, '$.arma_reforger_owned') IS NOT NULL
					OR json_type(answers, '$.ownership_check') IS NOT NULL
					OR json_type(answers, '$.verified_game_access') IS NOT NULL
				);
		`
	},
	{
		id: 4,
		name: 'users_identities_rename_requests_application_confirmation_and_outbox',
		up: `
			-- Add application confirmation metadata.
			ALTER TABLE applications ADD COLUMN confirmed_at DATETIME;
			ALTER TABLE applications ADD COLUMN confirmed_by_steamid64 TEXT;
			ALTER TABLE applications ADD COLUMN approval_email_sent_at DATETIME;
			-- Link applications to stable users (internal integer id).
			ALTER TABLE applications ADD COLUMN user_id INTEGER;
			CREATE INDEX IF NOT EXISTS idx_applications_confirmed_at ON applications(confirmed_at);
			CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
			CREATE INDEX IF NOT EXISTS idx_applications_approval_email_sent_at
				ON applications(approval_email_sent_at);

			-- Users represent people in our system (stable user_id).
			-- Identities link external providers (Steam now, others later) to a user.
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				player_confirmed_at DATETIME,
				confirmed_application_id INTEGER,
				current_callsign TEXT,
				FOREIGN KEY (confirmed_application_id) REFERENCES applications(id)
			);
			CREATE INDEX IF NOT EXISTS idx_users_player_confirmed_at ON users(player_confirmed_at);
			CREATE INDEX IF NOT EXISTS idx_users_current_callsign ON users(current_callsign);

			-- Active rename requirements live in a dedicated table.
			CREATE TABLE IF NOT EXISTS rename_requirements (
				user_id INTEGER PRIMARY KEY,
				required_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				required_by_steamid64 TEXT,
				reason TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_rename_requirements_required_at ON rename_requirements(required_at);

			CREATE TABLE IF NOT EXISTS user_identities (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				provider TEXT NOT NULL,
				provider_user_id TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				UNIQUE(provider, provider_user_id)
			);
			CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

			-- Backfill users for existing applications.
			-- We have a unique index on applications(steamid64), so each application maps 1:1 to a user.
			UPDATE applications
			SET user_id = COALESCE(user_id, id)
			WHERE user_id IS NULL;

			INSERT INTO users (id, current_callsign, created_at)
			SELECT
				a.user_id,
				CASE
					WHEN json_valid(a.answers) = 1
						AND json_type(a.answers, '$.callsign') IS NOT NULL
						AND TRIM(COALESCE(json_extract(a.answers, '$.callsign'), '')) != ''
					THEN TRIM(json_extract(a.answers, '$.callsign'))
					ELSE ('Steam_' || a.steamid64)
				END,
				a.created_at
			FROM applications a
			WHERE a.user_id IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);

			INSERT INTO user_identities (user_id, provider, provider_user_id, created_at)
			SELECT a.user_id, 'steam', a.steamid64, a.created_at
			FROM applications a
			WHERE a.user_id IS NOT NULL
				AND a.steamid64 IS NOT NULL
				AND a.steamid64 != ''
				AND NOT EXISTS (
					SELECT 1
					FROM user_identities ui
					WHERE ui.provider = 'steam' AND ui.provider_user_id = a.steamid64
				);

			-- Enforce one application per user.
			-- Production should already be safe (unique_steamid64), but keep this guard for any historical data.
			DELETE FROM applications
			WHERE user_id IS NOT NULL
				AND id NOT IN (
					SELECT MIN(id)
					FROM applications
					WHERE user_id IS NOT NULL
					GROUP BY user_id
				);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_id_unique
				ON applications(user_id)
				WHERE user_id IS NOT NULL;

			-- Rename requests are created by users when admins required a rename.
			CREATE TABLE IF NOT EXISTS rename_requests (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				old_callsign TEXT,
				new_callsign TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				decided_at DATETIME,
				decided_by_steamid64 TEXT,
				decline_reason TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id)
			);
			CREATE INDEX IF NOT EXISTS idx_rename_requests_user_id ON rename_requests(user_id);
			CREATE INDEX IF NOT EXISTS idx_rename_requests_status ON rename_requests(status);
			CREATE INDEX IF NOT EXISTS idx_rename_requests_created_at ON rename_requests(created_at);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_rename_requests_pending_unique
				ON rename_requests(user_id)
				WHERE status = 'pending';

			-- Callsign uniqueness should be enforced on the canonical field: users.current_callsign.
			UPDATE users
			SET current_callsign = TRIM(current_callsign)
			WHERE current_callsign IS NOT NULL;

			-- Ensure every user has a stable, valid callsign. Use Steam_<steamid64> as fallback.
			UPDATE users
			SET current_callsign = (
				'Steam_' || (
					SELECT ui.provider_user_id
					FROM user_identities ui
					WHERE ui.user_id = users.id AND ui.provider = 'steam'
					LIMIT 1
				)
			)
			WHERE current_callsign IS NULL OR TRIM(current_callsign) = '';

			-- If duplicates exist, keep the lowest user id as canonical and set the rest to Steam_<steamid64>.
			UPDATE users
			SET current_callsign = (
				'Steam_' || (
					SELECT ui.provider_user_id
					FROM user_identities ui
					WHERE ui.user_id = users.id AND ui.provider = 'steam'
					LIMIT 1
				)
			)
			WHERE current_callsign IS NOT NULL
				AND TRIM(current_callsign) != ''
				AND id NOT IN (
					SELECT MIN(id)
					FROM users
					WHERE current_callsign IS NOT NULL AND TRIM(current_callsign) != ''
					GROUP BY LOWER(current_callsign)
				);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_callsign_unique
				ON users(LOWER(current_callsign))
				WHERE current_callsign IS NOT NULL AND TRIM(current_callsign) != '';

			CREATE TABLE IF NOT EXISTS email_outbox (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				type TEXT NOT NULL,
				application_id INTEGER,
				payload TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
				attempts INTEGER NOT NULL DEFAULT 0,
				last_error TEXT,
				last_error_details TEXT,
				next_attempt_at DATETIME,
				processing_at DATETIME,
				sent_at DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			CREATE INDEX IF NOT EXISTS idx_email_outbox_status
				ON email_outbox(status, next_attempt_at);
			CREATE INDEX IF NOT EXISTS idx_email_outbox_type
				ON email_outbox(type);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_pending_unique
				ON email_outbox(type, application_id)
				WHERE status IN ('pending', 'processing');
		`
	},
	{
		id: 5,
		name: 'email_outbox_allow_multiple_per_application',
		up: `
			DROP INDEX IF EXISTS idx_email_outbox_pending_unique;

			-- Mark legacy pending outbox rows as failed if they lack the new subject/textContent fields.
			UPDATE email_outbox
			SET status = 'failed',
				last_error = 'schema_mismatch',
				last_error_details = 'Outbox payload missing subject/textContent after schema change',
				updated_at = CURRENT_TIMESTAMP
			WHERE status IN ('pending', 'processing')
				AND (
					json_type(payload, '$.subject') IS NULL
					OR json_type(payload, '$.textContent') IS NULL
				);

			ALTER TABLE email_outbox ADD COLUMN user_id INTEGER;
			UPDATE email_outbox
			SET user_id = (
				SELECT a.user_id
				FROM applications a
				WHERE a.id = email_outbox.application_id
				LIMIT 1
			)
			WHERE user_id IS NULL AND application_id IS NOT NULL;

			CREATE TABLE IF NOT EXISTS email_outbox_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				type TEXT NOT NULL,
				user_id INTEGER,
				payload TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
				attempts INTEGER NOT NULL DEFAULT 0,
				last_error TEXT,
				last_error_details TEXT,
				next_attempt_at DATETIME,
				processing_at DATETIME,
				sent_at DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			INSERT INTO email_outbox_new (
				id,
				type,
				user_id,
				payload,
				status,
				attempts,
				last_error,
				last_error_details,
				next_attempt_at,
				processing_at,
				sent_at,
				created_at,
				updated_at
			)
			SELECT
				id,
				type,
				user_id,
				payload,
				status,
				attempts,
				last_error,
				last_error_details,
				next_attempt_at,
				processing_at,
				sent_at,
				created_at,
				updated_at
			FROM email_outbox;

			DROP TABLE email_outbox;
			ALTER TABLE email_outbox_new RENAME TO email_outbox;

			CREATE INDEX IF NOT EXISTS idx_email_outbox_status
				ON email_outbox(status, next_attempt_at);
			CREATE INDEX IF NOT EXISTS idx_email_outbox_type
				ON email_outbox(type);
			CREATE INDEX IF NOT EXISTS idx_email_outbox_user_id
				ON email_outbox(user_id);
		`
	},
	{
		id: 6,
		name: 'content_settings',
		up: `
			CREATE TABLE IF NOT EXISTS content_settings (
				key TEXT PRIMARY KEY,
				value TEXT,
				updated_by TEXT,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE INDEX IF NOT EXISTS idx_content_settings_updated_at
				ON content_settings(updated_at);
		`
	},
	{
		id: 7,
		name: 'discord_identity',
		up: `
			ALTER TABLE users ADD COLUMN discord_id TEXT;
			ALTER TABLE users ADD COLUMN discord_token_encrypted TEXT;
			ALTER TABLE users ADD COLUMN discord_token_iv TEXT;

			CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id
				ON users(discord_id)
				WHERE discord_id IS NOT NULL;
		`
	},
	{
		id: 8,
		name: 'missions_and_badges',
		up: `
			CREATE TABLE IF NOT EXISTS missions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				short_code TEXT,
				status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'archived')),
				title TEXT NOT NULL DEFAULT '',
				description TEXT NOT NULL DEFAULT '',
				starts_at DATETIME,
				server_name TEXT NOT NULL DEFAULT '',
				server_host TEXT NOT NULL DEFAULT '',
				server_port INTEGER,
				early_password TEXT,
				final_password TEXT,
				server_details_hidden INTEGER NOT NULL DEFAULT 0 CHECK(server_details_hidden IN (0, 1)),
				priority_claim_opens_at DATETIME,
				priority_claim_manual_state TEXT NOT NULL DEFAULT 'default'
					CHECK(priority_claim_manual_state IN ('default', 'open', 'closed')),
				regular_join_enabled INTEGER NOT NULL DEFAULT 0 CHECK(regular_join_enabled IN (0, 1)),
				priority_gameplay_released_at DATETIME,
				regular_gameplay_released_at DATETIME,
				slotting_json TEXT NOT NULL,
				slotting_revision INTEGER NOT NULL DEFAULT 1,
				settings_revision INTEGER NOT NULL DEFAULT 1,
				published_at DATETIME,
				archived_at DATETIME,
				archive_status TEXT CHECK(archive_status IN ('completed', 'canceled')),
				archive_reason TEXT,
				archive_result_json TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_by_steamid64 TEXT,
				updated_by_steamid64 TEXT,
				published_by_steamid64 TEXT,
				archived_by_steamid64 TEXT
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_short_code_unique
				ON missions(LOWER(short_code))
				WHERE short_code IS NOT NULL AND TRIM(short_code) != '';
			CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
			CREATE INDEX IF NOT EXISTS idx_missions_published_at ON missions(published_at);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_single_published
				ON missions(status)
				WHERE status = 'published';
			CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_single_draft
				ON missions(status)
				WHERE status = 'draft';

			CREATE TABLE IF NOT EXISTS badge_types (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				label TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'retired')),
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_by_steamid64 TEXT,
				updated_by_steamid64 TEXT
			);

			CREATE TABLE IF NOT EXISTS user_badges (
				user_id INTEGER NOT NULL,
				badge_type_id INTEGER NOT NULL,
				assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				assigned_by_steamid64 TEXT NOT NULL,
				PRIMARY KEY (user_id, badge_type_id),
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				FOREIGN KEY (badge_type_id) REFERENCES badge_types(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_user_badges_badge_type_id
				ON user_badges(badge_type_id);

			CREATE TABLE IF NOT EXISTS mission_priority_badges (
				mission_id INTEGER NOT NULL,
				badge_type_id INTEGER NOT NULL,
				PRIMARY KEY (mission_id, badge_type_id),
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
				FOREIGN KEY (badge_type_id) REFERENCES badge_types(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_mission_priority_badges_badge_type_id
				ON mission_priority_badges(badge_type_id);

			CREATE TABLE IF NOT EXISTS mission_regular_joins (
				mission_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				joined_by_steamid64 TEXT NOT NULL,
				PRIMARY KEY (mission_id, user_id),
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_mission_regular_joins_user_id
				ON mission_regular_joins(user_id);

			CREATE TABLE IF NOT EXISTS mission_regular_release_snapshot (
				mission_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				released_at DATETIME NOT NULL,
				PRIMARY KEY (mission_id, user_id),
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_mission_regular_release_snapshot_user_id
				ON mission_regular_release_snapshot(user_id);

			CREATE TABLE IF NOT EXISTS mission_audit_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				mission_id INTEGER NOT NULL,
				actor_user_id INTEGER,
				actor_steamid64 TEXT,
				event_type TEXT NOT NULL,
				payload TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
				FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
			);

			CREATE INDEX IF NOT EXISTS idx_mission_audit_events_mission_created
				ON mission_audit_events(mission_id, created_at);
			CREATE INDEX IF NOT EXISTS idx_mission_audit_events_type
				ON mission_audit_events(event_type);

			DROP INDEX IF EXISTS idx_content_settings_updated_at;
			DROP TABLE IF EXISTS content_settings;
		`
	},
	{
		id: 9,
		name: 'mission_gameplay_progress_flags_and_public_updates',
		up: `
			ALTER TABLE missions ADD COLUMN priority_gameplay_ever_released INTEGER NOT NULL DEFAULT 0 CHECK(priority_gameplay_ever_released IN (0, 1));
			ALTER TABLE missions ADD COLUMN regular_gameplay_ever_released INTEGER NOT NULL DEFAULT 0 CHECK(regular_gameplay_ever_released IN (0, 1));

			UPDATE missions
			SET priority_gameplay_ever_released = CASE WHEN priority_gameplay_released_at IS NOT NULL THEN 1 ELSE 0 END,
				regular_gameplay_ever_released = CASE WHEN regular_gameplay_released_at IS NOT NULL THEN 1 ELSE 0 END;

			CREATE TABLE IF NOT EXISTS mission_public_updates (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				mission_id INTEGER NOT NULL,
				kind TEXT NOT NULL CHECK(kind IN (
					'squads_slotting_started',
					'priority_slotting_started',
					'regular_slotting_started',
					'game_started_wait_next_episode'
				)),
				episode_number INTEGER CHECK(episode_number IS NULL OR episode_number > 0),
				total_episodes INTEGER CHECK(total_episodes IS NULL OR total_episodes > 0),
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_by_steamid64 TEXT,
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_mission_public_updates_mission_created
				ON mission_public_updates(mission_id, created_at DESC, id DESC);
		`
	},
	{
		id: 10,
		name: 'rename_squad_access_to_unit',
		up: `
			-- Rename slot access type 'squad' → 'unit' in slotting JSON blobs
			UPDATE missions
			SET slotting_json = REPLACE(slotting_json, '"access":"squad"', '"access":"unit"')
			WHERE slotting_json LIKE '%"access":"squad"%';

			-- Recreate mission_public_updates with updated CHECK constraint
			CREATE TABLE mission_public_updates_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				mission_id INTEGER NOT NULL,
				kind TEXT NOT NULL CHECK(kind IN (
					'units_slotting_started',
					'priority_slotting_started',
					'regular_slotting_started',
					'game_started_wait_next_episode'
				)),
				episode_number INTEGER CHECK(episode_number IS NULL OR episode_number > 0),
				total_episodes INTEGER CHECK(total_episodes IS NULL OR total_episodes > 0),
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_by_steamid64 TEXT,
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
			);

			INSERT INTO mission_public_updates_new (id, mission_id, kind, episode_number, total_episodes, created_at, created_by_steamid64)
			SELECT id, mission_id,
				CASE WHEN kind = 'squads_slotting_started' THEN 'units_slotting_started' ELSE kind END,
				episode_number, total_episodes, created_at, created_by_steamid64
			FROM mission_public_updates;

			DROP TABLE mission_public_updates;

			ALTER TABLE mission_public_updates_new RENAME TO mission_public_updates;

			CREATE INDEX IF NOT EXISTS idx_mission_public_updates_mission_created
				ON mission_public_updates(mission_id, created_at DESC, id DESC);
		`
	},
	{
		id: 11,
		name: 'units',
		up: `
			CREATE TABLE IF NOT EXISTS units (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				tag TEXT NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified', 'verified')),
				avatar_data TEXT,
				avatar_mime TEXT,
				leader_user_id INTEGER,
				slots_allocated INTEGER NOT NULL DEFAULT 0,
				member_names TEXT NOT NULL DEFAULT '',
				history TEXT NOT NULL DEFAULT '',
				other_projects TEXT NOT NULL DEFAULT '',
				join_message TEXT NOT NULL DEFAULT '',
				created_by_user_id INTEGER NOT NULL,
				verified_at DATETIME,
				verified_by_steamid64 TEXT,
				unverified_at DATETIME,
				unverified_by_steamid64 TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE SET NULL,
				FOREIGN KEY (created_by_user_id) REFERENCES users(id)
			);

			CREATE UNIQUE INDEX IF NOT EXISTS idx_units_tag_unique
				ON units(LOWER(tag));

			CREATE UNIQUE INDEX IF NOT EXISTS idx_units_name_unique
				ON units(LOWER(name));

			CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
			CREATE INDEX IF NOT EXISTS idx_units_leader ON units(leader_user_id);

			CREATE TABLE IF NOT EXISTS unit_memberships (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				unit_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				role TEXT NOT NULL CHECK(role IN ('member', 'applicant')),
				message TEXT NOT NULL DEFAULT '',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				UNIQUE(unit_id, user_id)
			);

			CREATE INDEX IF NOT EXISTS idx_unit_memberships_unit ON unit_memberships(unit_id);
			CREATE INDEX IF NOT EXISTS idx_unit_memberships_user ON unit_memberships(user_id);
			CREATE INDEX IF NOT EXISTS idx_unit_memberships_role ON unit_memberships(role);

			CREATE TABLE IF NOT EXISTS unit_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				unit_id INTEGER NOT NULL,
				kind TEXT NOT NULL,
				actor_callsign TEXT,
				target_callsign TEXT,
				meta TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_unit_events_unit ON unit_events(unit_id, created_at DESC);
		`
	},
	{
		id: 12,
		name: 'unit_slotting',
		up: `
			ALTER TABLE missions ADD COLUMN unit_slotting_manual_state TEXT NOT NULL DEFAULT 'open'
				CHECK(unit_slotting_manual_state IN ('closed', 'open'));

			CREATE TABLE IF NOT EXISTS mission_unit_assignments (
				mission_id INTEGER NOT NULL,
				unit_id INTEGER NOT NULL,
				side_id TEXT NOT NULL,
				assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				assigned_by_steamid64 TEXT,
				PRIMARY KEY (mission_id, unit_id),
				FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
				FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_mua_mission ON mission_unit_assignments(mission_id);
		`
	},
	{
		id: 13,
		name: 'unit_gameplay_release',
		up: `
			ALTER TABLE missions ADD COLUMN unit_gameplay_released_at DATETIME;
			ALTER TABLE missions ADD COLUMN unit_gameplay_ever_released INTEGER NOT NULL DEFAULT 0;
		`
	},
	{
		id: 14,
		name: 'auto_convert_flag',
		up: `
			ALTER TABLE missions ADD COLUMN unit_slots_auto_converted INTEGER NOT NULL DEFAULT 0;
		`
	}
];
