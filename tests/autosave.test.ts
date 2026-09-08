import { it, expect, vi, afterEach } from 'vitest';
import { FieldQueue } from '@/lib/autosave';
afterEach(() => vi.useRealTimers());
it('debounces text and saves on blur', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockResolvedValue(undefined);
  const q = new FieldQueue<string>('', save, () => {});
  q.edit('h');
  q.edit('hello');
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(699);
  expect(save).not.toHaveBeenCalled();
  await q.flush();
  expect(save).toHaveBeenCalledExactlyOnceWith('hello');
  expect(q.status).toBe('Saved');
});
it('ratings save immediately and older requests cannot overtake new values', async () => {
  let resolve!: () => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue(undefined);
  const q = new FieldQueue<string | null>(null, save, () => {});
  q.edit('GREEN', true);
  expect(save).toHaveBeenCalledExactlyOnceWith('GREEN');
  q.edit('RED', true);
  q.receive('YELLOW');
  expect(q.value).toBe('RED');
  resolve();
  await q.flush();
  expect(save.mock.calls.map((c) => c[0])).toEqual(['GREEN', 'RED']);
  expect(q.dirty).toBe(false);
});
it('preserves failed text through remote updates and retries manually', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  const q = new FieldQueue<string>('', save, () => {});
  q.edit('Do not lose this');
  await q.flush();
  expect(q.status).toBe('Error');
  q.receive('Stale server');
  expect(q.value).toBe('Do not lose this');
  await q.flush();
  expect(q.status).toBe('Saved');
  expect(save).toHaveBeenLastCalledWith('Do not lose this');
});
it('automatically retries transient failures with a bounded retry count', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockRejectedValue(new Error('Offline'));
  const q = new FieldQueue<string>('', save, () => {});
  q.edit('Keep me', true);
  await vi.runAllTimersAsync();
  expect(save).toHaveBeenCalledTimes(3);
  expect(q.status).toBe('Error');
  expect(q.value).toBe('Keep me');
});
