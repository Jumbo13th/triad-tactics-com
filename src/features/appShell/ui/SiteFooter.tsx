import SocialLinks from '@/features/social/ui/SocialLinks';

export default function SiteFooter() {
  return (
    <footer className="mt-6 border-t border-neutral-900 pt-6 text-sm text-neutral-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; 2026 Triad Tactics</p>
        <SocialLinks />
      </div>
    </footer>
  );
}
