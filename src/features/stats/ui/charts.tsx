'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const ACCENT = '#d2b853';
const GRID = '#262626';
const TEXT = '#737373';

export type StandingsDatum = {
	name: string;
	score: number;
};

/** Fallback for a season with zero published games. */
export function StandingsChart({ data, label }: { data: StandingsDatum[]; label: string }) {
	if (data.length === 0) return null;

	return (
		<div className="h-56 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
					<CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
					<XAxis dataKey="name" stroke={TEXT} tick={{ fill: TEXT, fontSize: 12 }} />
					<YAxis stroke={TEXT} tick={{ fill: TEXT, fontSize: 12 }} width={36} />
					<Tooltip
						contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
						labelStyle={{ color: '#e5e7eb' }}
					/>
					<Bar dataKey="score" name={label} fill={ACCENT} radius={[3, 3, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
