import { listPrograms, createProgramHandler } from '@/server/controllers/program-controller';
import { handleRoute } from '@/server/http/route-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleRoute(listPrograms);
export const POST = handleRoute(createProgramHandler);
