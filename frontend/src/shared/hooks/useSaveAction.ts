import { useCallback, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved';

const MIN_SAVING_MS = 500;
const SAVED_MS = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSaveAction() {
  const [status, setStatus] = useState<SaveStatus>('idle');

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setStatus('saving');
    const started = Date.now();
    try {
      const result = await action();
      await sleep(Math.max(0, MIN_SAVING_MS - (Date.now() - started)));
      setStatus('saved');
      await sleep(SAVED_MS);
      return result;
    } catch (err) {
      setStatus('idle');
      throw err;
    }
  }, []);

  const reset = useCallback(() => setStatus('idle'), []);

  return { status, busy: status !== 'idle', run, reset };
}
