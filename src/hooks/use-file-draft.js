'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';

// Requests are serialized. A response updates revisions but never overwrites
// text typed after its snapshot was taken.
export function useFileDraft(data, setData, setDirty) {
    const latest = useRef(data);
    latest.current = data;
    const changes = useRef(new Map());
    const pending = useRef(null);
    const saveAction = useRef(null);
    const history = useRef({
        past: [],
        future: [],
        key: '',
        time: 0,
    });
    const [saving, setSaving] = useState(false);
    const [failure, setFailure] = useState(null);
    const [version, setVersion] = useState(0);
    const [historyVersion, setHistoryVersion] = useState(0);
    const [savedAt, setSavedAt] = useState(null);
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false; setDirty(false);
        };
    }, [setDirty]);

    function replace(next) {
        latest.current = next;
        if (active.current) {
            setData(next);
        }
    }
    function apply(programs) {
        for (const program of programs) {
            if (program !== latest.current.programs.find((candidate) => candidate.id === program.id)) {
                changes.current.set(program.id, (changes.current.get(program.id) || 0) + 1);
            }
        }
        replace({
            ...latest.current,
            programs,
        });
        setVersion((value) => value + 1);
        setDirty(true);
    }
    function update(programs, key = '') {
        if (programs.every((program, index) => program === latest.current.programs[index])) {
            return;
        }
        const stack = history.current;
        if (!key || stack.key !== key || Date.now() - stack.time > 1200) {
            stack.past.push(latest.current.programs);
            if (stack.past.length > 40) {
                stack.past.shift();
            }
        }
        stack.key = key;
        stack.time = Date.now();
        stack.future = [];
        apply(programs);
    }
    function travel(direction) {
        const stack = history.current;
        const from = direction === 'undo' ? stack.past : stack.future;
        const to = direction === 'undo' ? stack.future : stack.past;
        const snapshot = from.pop();
        if (!snapshot) {
            return;
        }
        to.push(latest.current.programs);
        stack.key = '';
        const programs = snapshot.map((program) => {
            const current = latest.current.programs.find((candidate) => candidate.id === program.id);
            return {
                ...program,
                revision: current.revision,
                updatedAt: current.updatedAt,
            };
        });
        apply(programs);
        setHistoryVersion((value) => value + 1);
    }
    const save = useCallback(() => {
        if (pending.current) {
            return pending.current;
        }
        if (!changes.current.size) {
            return Promise.resolve();
        }
        setSaving(true);
        setFailure(null);
        const snapshot = latest.current.programs;
        const captured = new Map(changes.current);
        const operation = (async () => {
            for (const program of snapshot.filter((candidate) => captured.has(candidate.id))) {
                const saved = await apiRequest(`/api/programs/${program.id}`, {
                    method: 'PUT',
                    body: program,
                });
                const unchanged = changes.current.get(program.id) === captured.get(program.id);
                if (unchanged) {
                    changes.current.delete(program.id);
                }
                const next = {
                    ...latest.current,
                    programs: latest.current.programs.map((candidate) => candidate.id === saved.id ? (unchanged ? saved : {
                        ...candidate,
                        revision: saved.revision,
                        updatedAt: saved.updatedAt,
                    }) : candidate),
                };
                latest.current = next;
                if (active.current) {
                    setData(next);
                }
            }
            if (active.current) {
                setSavedAt(new Date());
            }
        })().catch((error) => {
            if (active.current) {
                setFailure(error);
            }
            throw error;
        }).finally(() => {
            pending.current = null;
            if (active.current) {
                setSaving(false); setDirty(changes.current.size > 0);
            }
        });
        pending.current = operation;
        return operation;
    }, [setData, setDirty]);
    saveAction.current = save;
    useEffect(() => {
        if (!changes.current.size || saving || failure) {
            return;
        }
        const timer = setTimeout(() => {
            saveAction.current().catch(() => {});
        }, 1200);
        return () => clearTimeout(timer);
    }, [data, saving, failure]);
    return {
        update,
        save,
        travel,
        latest,
        saving,
        failure,
        savedAt,
        version,
        dirty: changes.current.size > 0,
        canUndo: history.current.past.length > 0,
        canRedo: history.current.future.length > 0,
        historyVersion,
    };
}
