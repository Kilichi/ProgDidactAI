'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
export function useResource(url) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const reload = useCallback(async () => {
        setError('');
        setLoading(true);
        try {
            const result = await apiRequest(url);
            setData(result);
            return result;
        } catch (failure) {
            setError(failure.message);
        } finally {
            setLoading(false);
        }
    }, [url]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        apiRequest(url).then((result) => {
            if (active) {
                setData(result);
            }
        }).catch((failure) => {
            if (active) {
                setError(failure.message);
            }
        }).finally(() => {
            if (active) {
                setLoading(false);
            }
        });
        return () => {
            active = false;
        };
    }, [url]);
    return {
        data,
        setData,
        error,
        loading,
        reload,
    };
}
