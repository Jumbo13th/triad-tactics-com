'use client';

import React from 'react';
import { Link } from "@/i18n/routing";
import { useSteamStatus } from "@/features/steamAuth/ui/useSteamStatus";

type PrimaryActionButtonProps = {
    primaryAction?: { href: string; label: string };
}

export default function PrimaryActionButton ({primaryAction}: PrimaryActionButtonProps) {
    const steamStatus = useSteamStatus();

    const isConfirmed = steamStatus.accessLevel ==='player' || steamStatus.accessLevel === 'admin';

    if (!primaryAction || (steamStatus.connected && isConfirmed)) {
        return null;
    }

    return (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
                href={primaryAction.href}
                className="inline-flex w-fit items-center justify-center rounded-2xl bg-[color:var(--accent)] px-5 py-3 text-base font-semibold tracking-wide text-neutral-950 shadow-[0_18px_45px_rgba(0,0,0,0.6)] hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
            >
                {primaryAction.label}
            </Link>
        </div>)
};
