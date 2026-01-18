import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    qualities: [75, 90]
  }
};

export default withNextIntl(nextConfig);
