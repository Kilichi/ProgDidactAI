import { getSettings, saveSettings } from '@/server/controllers/export-controller';
import { handleRoute } from '@/server/http/route-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleRoute(getSettings);
export const PUT = handleRoute(saveSettings);
