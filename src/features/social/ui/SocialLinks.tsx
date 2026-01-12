type SocialLinkProps = {
  href: string;
  label: string;
  badge?: string;
  tooltip?: string;
  children: React.ReactNode;
};

function SocialLink({ href, label, badge, tooltip, children }: SocialLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={tooltip}
      className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-neutral-500 transition hover:bg-neutral-900/40 hover:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-neutral-950"
    >
      {children}
      <span className="text-sm font-medium">{label}</span>
      {badge ? (
        <span className="rounded-full border border-neutral-800 bg-neutral-950/60 px-2 py-0.5 text-[11px] font-medium tracking-wide text-neutral-500">
          {badge}
        </span>
      ) : null}
    </a>
  );
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 15l5-3-5-3z" />
      <path d="M21.5 7.5a4 4 0 0 0-2.8-2.8C16.6 4 12 4 12 4s-4.6 0-6.7.7A4 4 0 0 0 2.5 7.5 41 41 0 0 0 2 12a41 41 0 0 0 .5 4.5 4 4 0 0 0 2.8 2.8C7.4 20 12 20 12 20s4.6 0 6.7-.7a4 4 0 0 0 2.8-2.8A41 41 0 0 0 22 12a41 41 0 0 0-.5-4.5" />
    </svg>
  );
}

export default function SocialLinks() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SocialLink
        href="https://github.com/Jumbo13th/triad-tactics-com"
        label="GitHub"
        badge="Open source"
        tooltip="Website source code (fully open source)"
      >
        <GitHubIcon />
      </SocialLink>
      <SocialLink href="https://www.youtube.com/@jumbo2007" label="YouTube">
        <YouTubeIcon />
      </SocialLink>
    </div>
  );
}
