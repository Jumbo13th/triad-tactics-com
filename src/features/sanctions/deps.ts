import {
	getActiveSiteBanForUser,
	getActiveStrikesForUser,
	getSanctionsForUser,
	listSanctions,
	countSanctionsByType,
	listPublicSanctions,
	createSanction,
	cancelSanction,
	updateSanctionExpiry,
	processStrikeEscalation
} from './infra/sqliteSanctions';
import type {
	CreateSanctionDeps,
	CancelSanctionDeps,
	UpdateSanctionExpiryDeps,
	ListSanctionsDeps,
	ListPublicSanctionsDeps,
	GetUserSanctionsDeps,
	CheckSiteBanDeps,
	ProcessStrikeEscalationDeps
} from './ports';

export const createSanctionDeps: CreateSanctionDeps = {
	repo: {
		createSanction,
		getActiveStrikesForUser,
		cancelSanction
	}
};

export const cancelSanctionDeps: CancelSanctionDeps = {
	repo: {
		cancelSanction
	}
};

export const updateSanctionExpiryDeps: UpdateSanctionExpiryDeps = {
	repo: {
		updateSanctionExpiry
	}
};

export const listSanctionsDeps: ListSanctionsDeps = {
	repo: {
		listSanctions,
		countSanctionsByType
	}
};

export const listPublicSanctionsDeps: ListPublicSanctionsDeps = {
	repo: {
		listPublicSanctions
	}
};

export const getUserSanctionsDeps: GetUserSanctionsDeps = {
	repo: {
		getSanctionsForUser
	}
};

export const checkSiteBanDeps: CheckSiteBanDeps = {
	repo: {
		getActiveSiteBanForUser
	}
};

export const processStrikeEscalationDeps: ProcessStrikeEscalationDeps = {
	repo: {
		processStrikeEscalation
	}
};
