// Recordings carry the game's localization keys ("#AR-Faction_US", "#AR-Role_Grenadier",
// "#AR-Callsign_US_Company_A #AR-Callsign_US_Platoon_1 2"). The dictionaries are the
// game's own strings for the kinds of names a replay shows, taken from the official string
// tables (Arma Reforger 1.8). Keys from mods fall back to a readable form of the key.

export type GameNames = Record<string, string>;

const LOADERS: Record<string, () => Promise<{ default: GameNames }>> = {
	en: () => import('./gameStrings/en.json'),
	ru: () => import('./gameStrings/ru.json'),
	uk: () => import('./gameStrings/uk.json'),
};

// Lite Lobby's own trigger messages, which recordings carry as keys in the same way.
const LOBBY: Record<string, GameNames> = {
	en: {
		'LL-TriggerMsg_CriticalLoss': 'The attackers have suffered critical losses.',
		'LL-TriggerMsg_Destroyed': 'The key object has been destroyed.',
		'LL-TriggerMsg_GroupDefeated': 'The key group has been eliminated.',
		'LL-TriggerMsg_TimeUp': 'The attackers’ time has run out — the defenders win.',
		'LL-TriggerMsg_Supremacy': 'One side has gained supremacy over the other — the outcome is decided.',
		'LL-TriggerMsg_ZoneCaptured': 'The attackers have captured the objective.',
	},
	ru: {
		'LL-TriggerMsg_CriticalLoss': 'Атакующие понесли критические потери.',
		'LL-TriggerMsg_Destroyed': 'Ключевой объект уничтожен.',
		'LL-TriggerMsg_GroupDefeated': 'Ключевая группа уничтожена.',
		'LL-TriggerMsg_TimeUp': 'Время атакующих истекло — победа обороняющихся.',
		'LL-TriggerMsg_Supremacy': 'Одна из сторон добилась превосходства над другой — исход боя предрешён.',
		'LL-TriggerMsg_ZoneCaptured': 'Атакующие захватили объект.',
	},
	uk: {
		'LL-TriggerMsg_CriticalLoss': 'Атакувальники зазнали критичних втрат.',
		'LL-TriggerMsg_Destroyed': 'Ключовий об’єкт знищено.',
		'LL-TriggerMsg_GroupDefeated': 'Ключову групу знищено.',
		'LL-TriggerMsg_TimeUp': 'Час атакувальників вичерпано — перемога оборонців.',
		'LL-TriggerMsg_Supremacy': 'Одна зі сторін здобула перевагу над іншою — результат бою вирішено.',
		'LL-TriggerMsg_ZoneCaptured': 'Атакувальники захопили об’єкт.',
	},
};

export async function loadGameNames(locale: string): Promise<GameNames> {
	const load = LOADERS[locale] ?? LOADERS.en;
	return { ...(await load()).default, ...(LOBBY[locale] ?? LOBBY.en) };
}

function humanize(key: string): string {
	const body = key.replace(/^[A-Za-z]+-/, '').replace(/^(Faction|Role|Callsign|Weapon|Vehicle)_/, '');
	return body
		.replace(/_Name$/, '')
		.replace(/_/g, ' ')
		.trim();
}

function translateKey(names: GameNames, key: string): string {
	const direct = names[key];
	if (direct) return direct;
	// Callsign keys can carry a numeric suffix the table leaves out ("Company_0-31").
	const dash = key.lastIndexOf('-');
	if (dash > key.indexOf('_')) {
		const base = names[key.slice(0, dash)];
		if (base) return `${base}${key.slice(dash)}`;
	}
	return humanize(key);
}

export function gameName(names: GameNames, value: string): string {
	if (!value.includes('#')) return value;
	return value
		.split(' ')
		.map((token) => (token.startsWith('#') ? translateKey(names, token.slice(1)) : token))
		.join(' ');
}
