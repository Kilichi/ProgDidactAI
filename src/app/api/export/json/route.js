import { downloadJSON } from '@/server/controllers/export-controller';
import { handleRoute } from '@/server/http/route-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = handleRoute(downloadJSON);
