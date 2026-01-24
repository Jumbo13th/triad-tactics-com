import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const withNextIntl = createNextIntlPlugin();

const baseConfig: NextConfig = {
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com'
      }
    ]
  }
};

export default function nextConfig(phase: string): NextConfig {
  const distDir =
    process.env.NEXT_DIST_DIR ||
    (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next');

  return withNextIntl({
    ...baseConfig,
    distDir
  });
}
