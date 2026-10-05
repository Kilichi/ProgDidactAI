import { getProgram, saveProgramHandler, deleteProgramHandler } from '@/server/controllers/program-controller';
import { handleRoute } from '@/server/http/route-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleRoute(getProgram);
export const PUT = handleRoute(saveProgramHandler);
export const DELETE = handleRoute(deleteProgramHandler);
