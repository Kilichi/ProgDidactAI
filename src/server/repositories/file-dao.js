import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../domain/schemas.js';
import { defaultSettings } from '../config.js';
export class FileDAO {
    constructor(dir) {
        this.dir = dir;
        this.file = path.join(dir, 'store.json');
        this.queue = Promise.resolve();
    }
    async init() {
        await mkdir(this.dir, { recursive: true });
        try {
            this.state = JSON.parse(await readFile(this.file, 'utf8'));
        } catch (e) {
            if (e.code !== 'ENOENT') {
                throw e;
            }
            this.state = {
                programs: {},
                sources: {},
                history: {},
                settings: defaultSettings,
            };
            await this.persist();
        }
    }
    async persist(state = this.state) {
        const temp = this.file + '.tmp';
        await writeFile(temp, JSON.stringify(state));
        await rename(temp, this.file);
    }
    mutate(fn) {
        const result = this.queue.then(async () => {
            const next = structuredClone(this.state);
            const value = fn(next);
            await this.persist(next);
            this.state = next;
            return structuredClone(value);
        });
        this.queue = result.catch(() => { });
        return result;
    }
    async listPrograms() {
        return structuredClone(Object.values(this.state.programs));
    }
    async getProgram(id) {
        const p = this.state.programs[id];
        if (!p) {
            throw new AppError('Programación no encontrada.', 404);
        }
        return structuredClone(p);
    }
    async insertProgram(p) {
        return this.mutate((s) => {
            s.programs[p.id] = p;
            s.history[p.id] = [];
            return p;
        });
    }
    async updateProgram(id, expected, data) {
        return this.mutate((s) => {
            const old = s.programs[id];
            if (!old) {
                throw new AppError('Programación no encontrada.', 404);
            }
            if (old.revision !== expected) {
                throw new AppError('Hay una versión más reciente. Recarga antes de guardar para no sobrescribirla.', 409);
            }
            s.history[id].push(old);
            s.programs[id] = {
                ...data,
                id,
                revision: old.revision + 1,
                createdAt: old.createdAt,
                updatedAt: new Date().toISOString(),
            };
            return s.programs[id];
        });
    }
    async history(id) {
        const p = await this.getProgram(id);
        return structuredClone([...(this.state.history[id] || []), p].reverse());
    }
    async deleteProgram(id, revision) {
        return this.mutate((s) => {
            const p = s.programs[id];
            if (!p) {
                throw new AppError('Programación no encontrada.', 404);
            }
            if (p.revision !== revision) {
                throw new AppError('El documento ha cambiado. Recarga antes de eliminarlo.', 409);
            }
            delete s.programs[id];
            delete s.history[id];
            return true;
        });
    }
    async insertSource(s) {
        return this.mutate((state) => {
            state.sources[s.id] = s;
            return s;
        });
    }
    async deleteSource(id) {
        return this.mutate((state) => {
            delete state.sources[id]; return { ok: true };
        });
    }
    async deleteFileDocument(id, programs) {
        return this.mutate((state) => {
            if (!state.sources[id]) {
                throw new AppError('Documento original no encontrado.', 404);
            }
            for (const program of programs) {
                if (state.programs[program.id]?.revision !== program.revision) {
                    throw new AppError('El documento ha cambiado. Recarga antes de eliminarlo.', 409);
                }
            }
            for (const program of programs) {
                delete state.programs[program.id];
                delete state.history[program.id];
            }
            delete state.sources[id];
            return { ok: true };
        });
    }
    async getSource(id) {
        const s = this.state.sources[id];
        if (!s) {
            throw new AppError('Documento original no encontrado.', 404);
        }
        return structuredClone(s);
    }
    async getSettings() {
        return structuredClone(this.state.settings);
    }
    async setSettings(settings) {
        return this.mutate((s) => {
            s.settings = settings;
            return settings;
        });
    }
    async close() { }
}
