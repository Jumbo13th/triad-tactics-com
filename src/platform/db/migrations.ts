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
		name: 'users_identities_rename_requests_and_application_confirmation',
		up: `
			-- Add application confirmation metadata.
			ALTER TABLE applications ADD COLUMN confirmed_at DATETIME;
			ALTER TABLE applications ADD COLUMN confirmed_by_steamid64 TEXT;
			-- Link applications to stable users (internal integer id).
			ALTER TABLE applications ADD COLUMN user_id INTEGER;
			CREATE INDEX IF NOT EXISTS idx_applications_confirmed_at ON applications(confirmed_at);
			CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);

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
		`
	}
];
