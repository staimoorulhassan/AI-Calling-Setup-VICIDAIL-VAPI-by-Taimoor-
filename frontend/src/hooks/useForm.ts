import { useState, useCallback } from 'react';

export function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);

  const set = useCallback((key: keyof T, value: string) =>
    setValues(prev => ({ ...prev, [key]: value })), []);

  const reset = useCallback((next?: Partial<T>) =>
    setValues(prev => ({ ...prev, ...initial, ...next })), []);

  return { values, set, reset };
}
