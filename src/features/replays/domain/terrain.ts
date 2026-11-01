// "{GUID}worlds/Eden/Eden.ent" or "$Addon:worlds/Arland/LobbyDemo.ent": the folder under
// worlds/ names the terrain, while the file is the mission's own world.
export function terrainName(world: string | null): string | null {
	if (!world) return null;
	const parts = world.replace(/^\{[0-9A-F]+\}/i, '').replace(/^\$[^:]+:/, '').split('/');
	const index = parts.findIndex((part) => part.toLowerCase() === 'worlds');
	if (index >= 0 && parts.length > index + 2) return parts[index + 1];
	const file = parts[parts.length - 1];
	return file ? file.replace(/\.ent$/i, '') : null;
}
