import type { ChangeEventHandler, RefObject } from 'react';

export function AdminSearchInput({
	inputRef,
	value,
	onChange,
	onClear,
	placeholder
}: {
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	onChange: ChangeEventHandler<HTMLInputElement>;
	onClear: () => void;
	placeholder: string;
}) {
	return (
		<div className="relative">
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				className="h-10 w-64 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 pr-10 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-sm shadow-black/20 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
			/>

			{value.trim() ? (
				<button
					type="button"
					onClick={onClear}
					className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-neutral-200 shadow-sm shadow-black/30 hover:border-neutral-500 hover:bg-white/5 hover:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
					aria-label="Clear"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M6 6l12 12" />
						<path d="M18 6L6 18" />
					</svg>
				</button>
			) : null}
		</div>
	);
}
