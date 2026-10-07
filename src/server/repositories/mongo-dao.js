import { MongoClient } from 'mongodb';
import { AppError } from '../domain/schemas.js';
import { defaultSettings } from '../config.js';
export class MongoDAO {
    constructor(uri, db) {
        this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        this.dbName = db;
    }
    async init() {
        try {
            await this.client.connect();
        } catch (error) {
            await this.client.close();
            console.error('Conexión MongoDB fallida:', error.name);
            throw new AppError('No se puede conectar a MongoDB. Comprueba MONGODB_URI y el acceso de red en Atlas, o usa DATA_DRIVER=file en .env para trabajar localmente. Reinicia Next.js después de cambiar la configuración.', 503);
        }
        this.db = this.client.db(this.dbName);
        this.programs = this.db.collection('programaciones');
        this.sources = this.db.collection('documentos');
        this.versions = this.db.collection('versiones');
        await this.versions.createIndex({
            programId: 1,
            revision: 1,
        }, { unique: true });
    }
    clean(value) {
        if (!value) {
            return value;
        }
        const { _id, ...p } = value;
        return p;
    }
    async listPrograms() {
        return (await this.programs.find().toArray()).map((p) => this.clean(p));
    }
    async getProgram(id) {
        const p = await this.programs.findOne({ _id: id });
        if (!p) {
            throw new AppError('Programación no encontrada.', 404);
        }
        return this.clean(p);
    }
    async insertProgram(p) {
        await this.programs.insertOne({
            ...p,
            _id: p.id,
        });
        return p;
    }
    async updateProgram(id, expected, data) {
        const old = await this.getProgram(id);
        if (old.revision !== expected) {
            throw new AppError('Hay una versión más reciente. Recarga antes de guardar.', 409);
        }
        // Archivar primero es seguro: la revisión anterior ya fue una versión válida.
        await this.versions.updateOne({
            programId: id,
            revision: old.revision,
        }, { $setOnInsert: { snapshot: old } }, { upsert: true });
        const next = {
            ...data,
            id,
            revision: old.revision + 1,
            createdAt: old.createdAt,
            updatedAt: new Date().toISOString(),
        };
        const result = await this.programs.replaceOne({
            _id: id,
            revision: expected,
        }, {
            ...next,
            _id: id,
        });
        if (!result.matchedCount) {
            throw new AppError('Hay una versión más reciente. Recarga antes de guardar.', 409);
        }
        return next;
    }
    async history(id) {
        const current = await this.getProgram(id);
        const rows = await this.versions
            .find({ programId: id })
            .sort({ revision: -1 })
            .toArray();
        return [
            current,
            ...rows
                .map((r) => r.snapshot)
                .filter((p) => p.revision < current.revision),
        ];
    }
    async deleteProgram(id, revision) {
        const result = await this.programs.deleteOne({
            _id: id,
            revision,
        });
        if (!result.deletedCount) {
            await this.getProgram(id);
            throw new AppError('El documento ha cambiado. Recarga antes de eliminarlo.', 409);
        }
        await this.versions.deleteMany({ programId: id });
        return true;
    }
    async insertSource(s) {
        await this.sources.insertOne({
            ...s,
            _id: s.id,
        });
        return s;
    }
    async deleteSource(id) {
        await this.sources.deleteOne({ _id: id });
        return { ok: true };
    }
    async deleteFileDocument(id, programs) {
        const session = this.client.startSession();
        try {
            await session.withTransaction(async () => {
                for (const program of programs) {
                    const result = await this.programs.deleteOne({
                        _id: program.id,
                        revision: program.revision,
                    }, { session });
                    if (!result.deletedCount) {
                        throw new AppError('El documento ha cambiado. Recarga antes de eliminarlo.', 409);
                    }
                    await this.versions.deleteMany({ programId: program.id }, { session });
                }
                const source = await this.sources.deleteOne({ _id: id }, { session });
                if (!source.deletedCount) {
                    throw new AppError('Documento original no encontrado.', 404);
                }
            });
        } catch (error) {
            if (error.code === 20) {
                throw new AppError('La eliminación segura requiere MongoDB con replica set (por ejemplo Atlas). Configura un replica set o utiliza el almacenamiento local.', 503);
            }
            throw error;
        } finally {
            await session.endSession();
        }
        return { ok: true };
    }
    async getSource(id) {
        const s = await this.sources.findOne({ _id: id });
        if (!s) {
            throw new AppError('Documento original no encontrado.', 404);
        }
        return this.clean(s);
    }
    async getSettings() {
        return ((await this.db.collection('configuracion').findOne({ _id: 'template' }))
            ?.value || defaultSettings);
    }
    async setSettings(value) {
        await this.db
            .collection('configuracion')
            .updateOne({ _id: 'template' }, { $set: { value } }, { upsert: true });
        return value;
    }
    async close() {
        await this.client.close();
    }
}
