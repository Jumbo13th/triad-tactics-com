import { useTranslations } from 'next-intl';
import ApplicationForm from '@/features/apply/ui/ApplicationForm';

export default function ApplyPage() {
  const tf = useTranslations('form');

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 shadow-sm shadow-black/20 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-50 sm:text-2xl">{tf('title')}</h2>
        <p className="mt-1 text-sm text-neutral-300">{tf('subtitle')}</p>
      </div>
      <ApplicationForm />
    </section>
  );
}
