import { describe, it, expect } from 'vitest';
import {
  automaticAdmin,
  normalizeName,
  canReadDetails,
  canViewCandidate,
  canManageProcedure,
  canViewPeerOverall,
  ratingSchema,
  validateField,
  type User,
  type Cycle,
  type Candidate,
} from '@/lib/domain';
const user = { id: 'alice', is_admin: false } as User,
  cycle = { mode: 'AUDITION' } as Cycle;
describe('identity and privacy rules', () => {
  it.each(['Lucas', 'Admin', ' lucas ', ' ADMIN '])('%s gets admin', (name) =>
    expect(automaticAdmin(name)).toBe(true),
  );
  it('normalizes full names and does not elevate ordinary names', () => {
    expect(normalizeName('  aLICE   mCdonald ')).toBe('Alice Mcdonald');
    expect(automaticAdmin('Alice')).toBe(false);
  });
  it('judge reads own details during auditions, never peer details', () => {
    expect(canReadDetails('alice', 'alice', cycle, false)).toBe(true);
    expect(canReadDetails('alice', 'ben', cycle, false)).toBe(false);
  });
  it('completed candidates expose only peer overall, not peer notes', () => {
    expect(canViewPeerOverall({ state: 'COMPLETED' } as Candidate)).toBe(true);
    expect(canReadDetails('alice', 'ben', cycle, false)).toBe(false);
    expect(canViewPeerOverall({ state: 'VOCAL_AUDITION' } as Candidate)).toBe(false);
  });
  it('deliberation or protected session allows peer details', () => {
    expect(canReadDetails('alice', 'ben', { ...cycle, mode: 'DELIBERATION' }, false)).toBe(true);
    expect(canReadDetails('alice', 'ben', cycle, true)).toBe(true);
    expect(canManageProcedure(user)).toBe(false);
  });
  it('exclusions are visible only to admins or unlocked sessions', () => {
    const c = { excluded: true } as Candidate;
    expect(canViewCandidate(user, c, false)).toBe(false);
    expect(canViewCandidate({ ...user, is_admin: true }, c, false)).toBe(true);
    expect(canViewCandidate(user, c, true)).toBe(true);
  });
  it('accepts null, rejects fake Grey and unknown fields', () => {
    expect(ratingSchema.parse(null)).toBe(null);
    expect(() => ratingSchema.parse('GREY')).toThrow();
    expect(() => validateField('profile', 'is_admin', true)).toThrow();
    expect(validateField('evaluation', 'vibe_notes', 'Interesting')).toEqual({
      field: 'vibe_notes',
      value: 'Interesting',
    });
  });
});
