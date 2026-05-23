import { pruneOldAuditEvents, claimPendingPriorityDiscordNotifications } from '@/features/games/infra/sqliteGames';
import { notifyPrioritySlottingInDiscord } from '@/features/games/useCases/notifyMissionPublishedInDiscord';

type Logger = {
	info: (obj: Record<string, unknown>, msg: string) => void;
	error: (obj: Record<string, unknown>, msg: string) => void;
};

type RunCronTasksInput = {
	actorSteamId64: string;
	discordBotToken: string | undefined;
	logger: Logger;
	errorToLogObject: (err: unknown) => Record<string, unknown>;
};

export async function runGamesCronTasks(input: RunCronTasksInput): Promise<void> {
	const auditDeleted = pruneOldAuditEvents(30);
	if (auditDeleted > 0) {
		input.logger.info({ deleted: auditDeleted, actor: input.actorSteamId64 }, 'audit_events_pruned_by_admin');
	}

	const pendingPriorityNotifications = claimPendingPriorityDiscordNotifications();
	await Promise.all(
		pendingPriorityNotifications.map((pending) =>
			notifyPrioritySlottingInDiscord(pending, input.discordBotToken).catch((err: unknown) => {
				input.logger.error({ ...input.errorToLogObject(err), missionId: pending.missionId }, 'discord_priority_cron_notify_failed');
			})
		)
	);
}
