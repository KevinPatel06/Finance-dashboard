import { describe, it, expect } from 'vitest';
import { IPC } from '../shared/ipc';
import { REPO_API } from '../core/apiMap';

/** Channels handled by platform services, not by repo functions. */
const PLATFORM_CHANNELS = new Set<string>([IPC.DB_BACKUP, IPC.DB_RESTORE, IPC.EXPORT_CSV]);

describe('apiMap', () => {
  it('covers every repo-backed IPC channel exactly once', () => {
    const mapped = REPO_API.map((e) => e.channel);
    expect(new Set(mapped).size).toBe(mapped.length); // no duplicates

    const expected = Object.values(IPC).filter((c) => !PLATFORM_CHANNELS.has(c));
    expect(new Set(mapped)).toEqual(new Set(expected));
  });

  it('binds every entry to a callable', () => {
    for (const entry of REPO_API) {
      expect(typeof entry.fn, entry.channel).toBe('function');
    }
  });

  it('marks reads as non-mutating and writes as mutating', () => {
    const byChannel = new Map(REPO_API.map((e) => [e.channel, e]));
    expect(byChannel.get(IPC.LIST_BILLS)!.mutates).toBe(false);
    expect(byChannel.get(IPC.CREATE_BILL)!.mutates).toBe(true);
    expect(byChannel.get(IPC.DELETE_BILL)!.mutates).toBe(true);
    // listDebts applies pending interest, and listExpenses materializes
    // recurring templates — both write, despite the "list" name.
    expect(byChannel.get(IPC.LIST_DEBTS)!.mutates).toBe(true);
    expect(byChannel.get(IPC.LIST_EXPENSES)!.mutates).toBe(true);
  });
});
