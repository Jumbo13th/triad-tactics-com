import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from './adminAuth';
import { mailingRequestSchema } from '@/features/admin/domain/requests';
import { sendMailing } from '@/features/admin/useCases/sendMailing';
import { sendMailingDeps } from '@/features/admin/deps';

export async function postApprovedBroadcastRoute(request: NextRequest): Promise<NextResponse> {
	try {
		const admin = requireAdmin(request);
		if (!admin.ok) return admin.response;

		const body: unknown = await request.json();
		const parsed = mailingRequestSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: 'validation_error' }, { status: 400 });
		}

		const result = sendMailing(sendMailingDeps, {
			applicationIds: parsed.data.applicationIds,
			subjectEn: parsed.data.subjectEn,
			bodyEn: parsed.data.bodyEn,
			subjectRu: parsed.data.subjectRu,
			bodyRu: parsed.data.bodyRu
		});

		if (!result.ok) {
			return NextResponse.json({ error: 'server_error' }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			total: result.total,
			queued: result.queued,
			skippedNoEmail: result.skippedNoEmail,
			skippedDuplicate: result.skippedDuplicate
		});
	} catch {
		return NextResponse.json({ error: 'server_error' }, { status: 500 });
	}
}
