import { listFiles } from '@/server/controllers/file-controller';
import { handleRoute } from '@/server/http/route-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleRoute(listFiles);
