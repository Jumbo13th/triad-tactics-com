type MarkerLocale = 'ar' | 'en' | 'ru' | 'uk';

// The in-game marker dialog offers exactly these glyphs (LiteIcons imageset,
// per the LL_GameMode_Lobby prefab) in five fixed colors. The PNGs under
// /markers/icons are the game textures, pre-tinted with the exact in-game
// colors — the glyphs carry internal grey detail (e.g. the vehicle oval) in
// color rather than alpha, so tinting happens at bake time, not in CSS.
type MarkerIcon = 'dot' | 'squad' | 'fire-team' | 'vehicle' | 'landing' | 'flag' | 'exclamation' | 'question';
type MarkerColor = 'red' | 'blue' | 'green' | 'yellow' | 'black';

type MarkerItem = {
	icon: MarkerIcon;
	texts: Record<MarkerLocale, string[]>;
};

type MarkerColumn = {
	id: string;
	titles: Record<MarkerLocale, string[]>;
	headerClass: string;
	color: MarkerColor;
	items: MarkerItem[];
};

const columns: MarkerColumn[] = [
	{
		id: 'ally',
		titles: {
			ar: ['حليف'],
			en: ['Ally'],
			ru: ['Союзник'],
			uk: ['Союзник']
		},
		headerClass: 'border-red-500/40 bg-red-600/35',
		color: 'red',
		items: [
			{
				icon: 'dot',
				texts: {
					ar: ['جندي مشاة', 'حليف'],
					en: ['Allied infantryman'],
					ru: ['Союзный пехотинец'],
					uk: ['Союзний піхотинець']
				}
			},
			{
				icon: 'squad',
				texts: {
					ar: ['فصيلة مشاة', 'حليفة'],
					en: ['Allied infantry', 'squad'],
					ru: ['Союзное пехотное', 'отделение'],
					uk: ['Союзне піхотне', 'відділення']
				}
			},
			{
				icon: 'fire-team',
				texts: {
					ar: ['فريق رماية', 'حليف'],
					en: ['Allied fire team'],
					ru: ['Союзная огневая', 'группа'],
					uk: ['Союзна вогнева', 'група']
				}
			},
			{
				icon: 'vehicle',
				texts: {
					ar: ['آلية', 'حليفة'],
					en: ['Allied vehicle'],
					ru: ['Союзная техника'],
					uk: ['Союзна техніка']
				}
			},
			{
				icon: 'landing',
				texts: {
					ar: ['إنزال', 'حليف'],
					en: ['Allied landing'],
					ru: ['Высадка союзников'],
					uk: ['Висадка союзників']
				}
			},
			{
				icon: 'flag',
				texts: {
					ar: ['مقر', 'حليف'],
					en: ['Allied HQ'],
					ru: ['Союзный штаб'],
					uk: ['Союзний штаб']
				}
			},
			{
				icon: 'exclamation',
				texts: {
					ar: ['انتباه،', 'حليف'],
					en: ['Warning, ally'],
					ru: ['Внимание, союзник'],
					uk: ['Увага, союзник']
				}
			},
			{
				icon: 'question',
				texts: {
					ar: ['طلب معلومات عن', 'وجود الحلفاء'],
					en: ['Request info about', 'allies present'],
					ru: ['Запрос информации', 'о наличии союзников'],
					uk: ['Запит інформації', 'про наявність союзників']
				}
			}
		]
	},
	{
		id: 'enemy',
		titles: {
			ar: ['عدو'],
			en: ['Enemy'],
			ru: ['Противник'],
			uk: ['Противник']
		},
		headerClass: 'border-sky-500/40 bg-sky-600/35',
		color: 'blue',
		items: [
			{
				icon: 'dot',
				texts: {
					ar: ['جندي مشاة', 'معادٍ'],
					en: ['Enemy infantryman'],
					ru: ['Вражеский пехотинец'],
					uk: ['Ворожий піхотинець']
				}
			},
			{
				icon: 'squad',
				texts: {
					ar: ['فصيلة مشاة', 'معادية'],
					en: ['Enemy infantry', 'squad'],
					ru: ['Вражеское пехотное', 'отделение'],
					uk: ['Вороже піхотне', 'відділення']
				}
			},
			{
				icon: 'fire-team',
				texts: {
					ar: ['فريق رماية', 'معادٍ'],
					en: ['Enemy fire team'],
					ru: ['Вражеская огневая', 'группа'],
					uk: ['Ворожа вогнева', 'група']
				}
			},
			{
				icon: 'vehicle',
				texts: {
					ar: ['آلية', 'معادية'],
					en: ['Enemy vehicle'],
					ru: ['Вражеская техника'],
					uk: ['Ворожа техніка']
				}
			},
			{
				icon: 'landing',
				texts: {
					ar: ['إنزال', 'معادٍ'],
					en: ['Enemy landing'],
					ru: ['Высадка противников'],
					uk: ['Висадка противника']
				}
			},
			{
				icon: 'flag',
				texts: {
					ar: ['مقر', 'معادٍ'],
					en: ['Enemy HQ'],
					ru: ['Вражеский штаб'],
					uk: ['Ворожий штаб']
				}
			},
			{
				icon: 'exclamation',
				texts: {
					ar: ['انتباه،', 'عدو'],
					en: ['Warning, enemy'],
					ru: ['Внимание, противник'],
					uk: ['Увага, противник']
				}
			},
			{
				icon: 'question',
				texts: {
					ar: ['طلب معلومات عن', 'وجود العدو'],
					en: ['Request info about', 'enemies present'],
					ru: ['Запрос информации', 'о наличии противников'],
					uk: ['Запит інформації', 'про наявність противника']
				}
			}
		]
	},
	{
		id: 'route',
		titles: {
			ar: ['عنصر مسار /', 'مهمة'],
			en: ['Route element / Task'],
			ru: ['Элемент маршрута / задача'],
			uk: ['Елемент маршруту /', 'завдання']
		},
		headerClass: 'border-emerald-500/40 bg-emerald-600/35',
		color: 'green',
		items: [
			{
				icon: 'dot',
				texts: {
					ar: ['نقطة مسار', 'لمشاة حليف'],
					en: ['Waypoint for allied', 'infantryman'],
					ru: ['Маршрутная точка союзного', 'пехотинца'],
					uk: ['Маршрутна точка союзного', 'піхотинця']
				}
			},
			{
				icon: 'squad',
				texts: {
					ar: ['نقطة مسار لفصيلة', 'مشاة حليفة'],
					en: ['Waypoint for allied', 'infantry squad'],
					ru: ['Маршрутная точка союзного', 'пехотного отделения'],
					uk: ['Маршрутна точка союзного', 'піхотного відділення']
				}
			},
			{
				icon: 'fire-team',
				texts: {
					ar: ['نقطة مسار لفريق', 'رماية حليف'],
					en: ['Waypoint for allied', 'fire team'],
					ru: ['Маршрутная точка союзной', 'огневой группы'],
					uk: ['Маршрутна точка союзної', 'вогневої групи']
				}
			},
			{
				icon: 'vehicle',
				texts: {
					ar: ['نقطة مسار', 'لآلية حليفة'],
					en: ['Waypoint for allied', 'vehicle'],
					ru: ['Маршрутная точка союзной', 'техники'],
					uk: ['Маршрутна точка союзної', 'техніки']
				}
			},
			{
				icon: 'landing',
				texts: {
					ar: ['إنزال', 'مخطط'],
					en: ['Planned landing'],
					ru: ['Планируемая высадка'],
					uk: ['Запланована висадка']
				}
			},
			{
				icon: 'flag',
				texts: {
					ar: ['موقع مقر مخطط /', 'هدف وسيط'],
					en: ['Planned HQ position /', 'intermediate objective'],
					ru: ['Планируемая позиция штаба /', 'промежуточная цель'],
					uk: ['Запланована позиція штабу /', 'проміжна ціль']
				}
			},
			{
				icon: 'exclamation',
				texts: {
					ar: ['تحذير عند', 'الموقع'],
					en: ['Warning at position'],
					ru: ['Внимание на позицию'],
					uk: ['Увага на позиції']
				}
			},
			{
				icon: 'question',
				texts: {
					ar: ['طلب معلومات عن', 'نقطة اهتمام'],
					en: ['Request info about', 'point of interest'],
					ru: ['Запрос информации', 'о точке интереса'],
					uk: ['Запит інформації', 'про точку інтересу']
				}
			}
		]
	},
	{
		id: 'warning',
		titles: {
			ar: ['تحذير'],
			en: ['Warning'],
			ru: ['Внимание'],
			uk: ['Увага']
		},
		headerClass: 'border-amber-400/40 bg-amber-500/35',
		color: 'yellow',
		items: [
			{
				icon: 'dot',
				texts: {
					ar: ['جندي مشاة', 'محتمل'],
					en: ['Suspected infantryman'],
					ru: ['Возможный пехотинец'],
					uk: ['Ймовірний піхотинець']
				}
			},
			{
				icon: 'squad',
				texts: {
					ar: ['فصيلة مشاة', 'محتملة'],
					en: ['Suspected infantry', 'squad'],
					ru: ['Возможное пехотное', 'отделение'],
					uk: ['Ймовірне піхотне', 'відділення']
				}
			},
			{
				icon: 'fire-team',
				texts: {
					ar: ['فريق رماية', 'محتمل'],
					en: ['Suspected fire team'],
					ru: ['Возможная огневая', 'группа'],
					uk: ['Ймовірна вогнева', 'група']
				}
			},
			{
				icon: 'vehicle',
				texts: {
					ar: ['آلية', 'محتملة'],
					en: ['Suspected vehicle'],
					ru: ['Возможная техника'],
					uk: ['Ймовірна техніка']
				}
			},
			{
				icon: 'landing',
				texts: {
					ar: ['إنزال', 'محتمل'],
					en: ['Possible landing'],
					ru: ['Возможная высадка'],
					uk: ['Можлива висадка']
				}
			},
			{
				icon: 'flag',
				texts: {
					ar: ['مقر', 'محتمل'],
					en: ['Possible HQ'],
					ru: ['Возможный штаб'],
					uk: ['Ймовірний штаб']
				}
			},
			{
				icon: 'exclamation',
				texts: {
					ar: ['تحذير'],
					en: ['Warning'],
					ru: ['Внимание'],
					uk: ['Увага']
				}
			},
			{
				icon: 'question',
				texts: {
					ar: ['طلب معلومات', 'عام'],
					en: ['General info request'],
					ru: ['Общий запрос информации'],
					uk: ['Загальний запит', 'інформації']
				}
			}
		]
	},
	{
		id: 'destroyed',
		titles: {
			ar: ['مدمّر'],
			en: ['Destroyed'],
			ru: ['Уничтожено'],
			uk: ['Знищено']
		},
		headerClass: 'border-neutral-500/40 bg-neutral-800/80',
		color: 'black',
		items: [
			{
				icon: 'dot',
				texts: {
					ar: ['جندي مشاة قتيل /', 'لغم'],
					en: ['Dead infantryman /', 'landmine'],
					ru: ['Мёртвый пехотинец /', 'мина'],
					uk: ['Мертвий піхотинець /', 'міна']
				}
			},
			{
				icon: 'squad',
				texts: {
					ar: ['فصيلة', 'مدمّرة'],
					en: ['Destroyed squad'],
					ru: ['Уничтоженное отделение'],
					uk: ['Знищене відділення']
				}
			},
			{
				icon: 'fire-team',
				texts: {
					ar: ['فريق رماية', 'مدمّر'],
					en: ['Destroyed fire team'],
					ru: ['Уничтоженная огневая', 'группа'],
					uk: ['Знищена вогнева', 'група']
				}
			},
			{
				icon: 'vehicle',
				texts: {
					ar: ['آلية', 'مدمّرة'],
					en: ['Destroyed vehicle'],
					ru: ['Уничтоженная техника'],
					uk: ['Знищена техніка']
				}
			},
			{
				icon: 'landing',
				texts: {
					ar: ['إنزال', 'ملغى'],
					en: ['Cancelled landing'],
					ru: ['Отменённая высадка'],
					uk: ['Скасована висадка']
				}
			},
			{
				icon: 'flag',
				texts: {
					ar: ['مقر', 'مدمّر'],
					en: ['Destroyed HQ'],
					ru: ['Уничтоженный штаб'],
					uk: ['Знищений штаб']
				}
			},
			{
				icon: 'exclamation',
				texts: {
					ar: ['تهديد', 'مُزال'],
					en: ['Threat eliminated'],
					ru: ['Угроза устранена'],
					uk: ['Загрозу усунено']
				}
			},
			{
				icon: 'question',
				texts: {
					ar: ['طلب', 'مغلق'],
					en: ['Request closed'],
					ru: ['Запрос закрыт'],
					uk: ['Запит закрито']
				}
			}
		]
	}
];

function parseMarkdown(content: string) {
	const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const titleLine = lines.find((line) => line.startsWith('# '));
	const paragraphs = lines.filter((line) => !line.startsWith('# '));

	return {
		title: titleLine ? titleLine.slice(2).trim() : '',
		intro: paragraphs[0] ?? ''
	};
}

export default function MarkersStandardPage({
	content,
	textLocale
}: {
	content: string;
	textLocale: MarkerLocale;
}) {
	const { title, intro } = parseMarkdown(content);

	const renderLines = (lines: string[]) =>
		lines.map((line, index) => (
			<span key={`line-${index}`} className="block">
				{line}
			</span>
		));

	return (
		<section className="text-sm text-neutral-200">
			<div className="space-y-8 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-6 shadow-sm shadow-black/20 sm:px-6">
				<header className="space-y-3 border-b border-neutral-800 pb-6">
					<h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{title}</h1>
					{intro ? <p className="max-w-3xl leading-7 text-neutral-300">{intro}</p> : null}
				</header>

				<div className="grid gap-4 xl:grid-cols-2">
					{columns.map((column) => {
						const titleLines = column.titles[textLocale];
						return (
							<section
								key={column.id}
								className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
							>
								<header className={`border-b px-4 py-3 ${column.headerClass}`}>
									<h2 className="text-lg font-semibold tracking-tight text-neutral-50">{renderLines(titleLines)}</h2>
								</header>
								<div className="divide-y divide-white/6">
									{column.items.map((item, index) => {
										const lines = item.texts[textLocale];
										return (
											<div key={`${column.id}-${index}`} className="flex items-center gap-4 px-4 py-3">
												<div
													aria-hidden="true"
													className="h-[44px] w-[46px] shrink-0 rounded-md bg-[#e9e6dc] ring-1 ring-black/20"
													style={{
														backgroundImage: `url('/markers/icons/${item.icon}-${column.color}.png')`,
														backgroundRepeat: 'no-repeat',
														backgroundPosition: 'center',
														backgroundSize: '34px 34px'
													}}
												/>
												<div className="min-w-0 text-base leading-6 text-neutral-100">{renderLines(lines)}</div>
											</div>
										);
									})}
								</div>
							</section>
						);
					})}
				</div>
			</div>
		</section>
	);
}
