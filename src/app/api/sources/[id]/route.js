import { getSource } from '@/server/controllers/document-controller';
import { handleRoute } from '@/server/http/route-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleRoute(getSource);
