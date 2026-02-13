type ProfileFieldProps = {
    label: string;
    value: string;
    fullWidth?: boolean;
};

export const ProfileField = ({ label, value, fullWidth }: ProfileFieldProps) => {
    return (
        <div
            className={
                'rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 shadow-sm shadow-black/10' +
                (fullWidth ? ' sm:col-span-2' : '')
            }
        >
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
            <p className="mt-1 text-sm text-neutral-100">{value}</p>
        </div>
    );
}
