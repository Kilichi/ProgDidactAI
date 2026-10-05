import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const nextConfig = {
    outputFileTracingRoot: process.cwd(),
    serverExternalPackages: ['mongodb', 'mammoth', 'puppeteer-core'],
    experimental: { cpus: 2 },
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                {
                    key: 'X-Content-Type-Options',
                    value: 'nosniff',
                },
                {
                    key: 'Referrer-Policy',
                    value: 'same-origin',
                },
            ],
        }];
    },
};
export default function configuration(phase) {
    return {
        ...nextConfig,
        distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    };
}
