import React from 'react';
import {useTranslations} from "next-intl";

export const ProfileNotAuthorized = () => {
    const t = useTranslations('profile');

    return (
        <section className="grid gap-6">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{t('title')}</h2>
                <p className="mt-2 text-sm text-neutral-300 sm:text-base">{t('notAuthorized')}</p>
            </div>
        </section>
    );
};
