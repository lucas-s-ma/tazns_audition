import 'server-only';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './supabase';
export const cookieName = 'tazns_session';
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export async function session() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) throw new Error('UNAUTHENTICATED');
  const client = db();
  const { data: s, error } = await client
    .from('sessions')
    .select('*')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .single();
  if (error || !s) throw new Error('UNAUTHENTICATED');
  const { data: user, error: e } = await client
    .from('users')
    .select('*')
    .eq('id', s.user_id)
    .single();
  if (e || !user) throw new Error('UNAUTHENTICATED');
  return {
    user,
    hash: s.token_hash,
    unlocked: !!s.unlocked_until && Date.parse(s.unlocked_until) > Date.now(),
  };
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const { error } = await db()
    .from('sessions')
    .insert({
      token_hash: hashToken(token),
      user_id: userId,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
  if (error) throw error;
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 86400,
  });
}
