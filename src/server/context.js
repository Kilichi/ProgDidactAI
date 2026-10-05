import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getConfiguration } from './config.js';
import { FileDAO } from './repositories/file-dao.js';
import { MongoDAO } from './repositories/mongo-dao.js';
const contextKey = Symbol.for('progdidactai.server-context');
async function initializeContext() {
    const config = getConfiguration();
    if (!['file', 'mongodb'].includes(config.driver)) {
        throw new Error('DATA_DRIVER debe ser file o mongodb.');
    }
    const dao = config.driver === 'mongodb'
        ? new MongoDAO(config.mongoUri, config.mongoDb)
        : new FileDAO(config.dataDir);
    await dao.init();
    await mkdir(path.join(config.dataDir, 'uploads'), { recursive: true });
    let mutationQueue = Promise.resolve();
    const context = {
        config,
        dao,
        jobs: new Map(),
        importQueue: Promise.resolve(),
        mutate(operation) {
            const result = mutationQueue.then(operation);
            mutationQueue = result.catch(() => { });
            return result;
        },
    };
    return context;
}
export async function getContext() {
    if (!globalThis[contextKey]) {
        globalThis[contextKey] = initializeContext().catch((error) => {
            delete globalThis[contextKey];
            throw error;
        });
    }
    return globalThis[contextKey];
}
export function getProviderAvailability() {
    return {
        default: getConfiguration().provider,
        local: true,
        gemini: Boolean(process.env.GEMINI_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
    };
}
