import { beforeEach, describe, expect, it } from 'vitest';
import { setupIsolatedDb } from '../../../fixtures/isolatedDb';
import { buildTestApplicationRecord } from '../../../fixtures/application';
import { dbOperations, getDb } from '../../../fixtures/dbOperations';
import { insertApplication } from '@/features/apply/infra/sqliteApplications';
import { sendMailing } from '@/features/admin/useCases/sendMailing';
import { sendMailingDeps } from '@/features/admin/deps';

type OutboxRow = {
	user_id: number | null;
	payload: string;
};

function listOutboxRows(): OutboxRow[] {
	const db = getDb();
	return db
		.prepare('SELECT user_id, payload FROM email_outbox ORDER BY id ASC')
		.all() as OutboxRow[];
}

function countOutboxRows(): number {
	const db = getDb();
	const row = db.prepare('SELECT COUNT(*) as count FROM email_outbox').get() as { count: number };
	return row.count;
}

describe('sendMailing (mailing)', () => {
	beforeEach(async () => {
		await setupIsolatedDb('triad-tactics-mailing-send');
	});

	it('routes locale templates and appends signature', () => {
		const enRecord = buildTestApplicationRecord({
			email: 'en@example.com',
			steamid64: '76561198000000111',
			callsign: 'EN',
			overrides: {
				locale: 'en',
				answers: { name: 'English Name', callsign: 'EN' }
			}
		});
		const ruRecord = buildTestApplicationRecord({
			email: 'ru@example.com',
			steamid64: '76561198000000222',
			callsign: 'RU',
			overrides: {
				locale: 'ru',
				answers: { name: 'Русское Имя', callsign: 'RU' }
			}
		});

		const insertedEn = insertApplication(enRecord);
		const insertedRu = insertApplication(ruRecord);
		if (!insertedEn.success || !insertedRu.success) {
			throw new Error('Failed to insert applications');
		}

		const enId = Number(insertedEn.id);
		const ruId = Number(insertedRu.id);

		dbOperations.confirmApplication(enId, '76561198012345678');
		dbOperations.confirmApplication(ruId, '76561198012345678');

		const result = sendMailing(sendMailingDeps, {
			applicationIds: [enId, ruId],
			subjectEn: 'Hello {name}',
			bodyEn: 'Hi {name} ({callsign})',
			subjectRu: 'Привет {name}',
			bodyRu: 'Привет {name} ({callsign})'
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.total).toBe(2);
			expect(result.queued).toBe(2);
		}

		const db = getDb();
		const enUser = db
			.prepare('SELECT user_id FROM applications WHERE id = ?')
			.get(enId) as { user_id: number | null };
		const ruUser = db
			.prepare('SELECT user_id FROM applications WHERE id = ?')
			.get(ruId) as { user_id: number | null };

		const outbox = listOutboxRows();
		const payloadByUserId = new Map<number, Record<string, unknown>>();
		for (const row of outbox) {
			if (row.user_id == null) continue;
			payloadByUserId.set(row.user_id, JSON.parse(row.payload) as Record<string, unknown>);
		}

		const enPayload = payloadByUserId.get(enUser.user_id ?? -1);
		const ruPayload = payloadByUserId.get(ruUser.user_id ?? -1);

		expect(enPayload?.subject).toBe('Hello English Name');
		expect(ruPayload?.subject).toBe('Привет Русское Имя');
		expect(enPayload?.textContent).toContain('Hi English Name (EN)');
		expect(ruPayload?.textContent).toContain('Привет Русское Имя (RU)');

		const enText = String(enPayload?.textContent ?? '');
		const ruText = String(ruPayload?.textContent ?? '');
		expect(enText.endsWith('— Triad Tactics')).toBe(true);
		expect(ruText.endsWith('— Triad Tactics')).toBe(true);
		expect(enText.match(/— Triad Tactics/g)?.length ?? 0).toBe(1);
		expect(ruText.match(/— Triad Tactics/g)?.length ?? 0).toBe(1);
	});

	it('returns database_error when user_id is missing', () => {
		const record = buildTestApplicationRecord({
			email: 'nouser@example.com',
			steamid64: '76561198000000333',
			callsign: 'NoUser',
			overrides: {
				locale: 'en',
				answers: { name: 'Missing User' }
			}
		});

		const inserted = insertApplication(record);
		if (!inserted.success) throw new Error('Failed to insert application');
		const applicationId = Number(inserted.id);

		dbOperations.confirmApplication(applicationId, '76561198012345678');
		const db = getDb();
		db.prepare('UPDATE applications SET user_id = NULL WHERE id = ?').run(applicationId);

		const result = sendMailing(sendMailingDeps, {
			applicationIds: [applicationId],
			subjectEn: 'Hello {name}',
			bodyEn: 'Hi {name}',
			subjectRu: 'Привет {name}',
			bodyRu: 'Привет {name}'
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('database_error');
		}
		expect(countOutboxRows()).toBe(0);
	});
});
