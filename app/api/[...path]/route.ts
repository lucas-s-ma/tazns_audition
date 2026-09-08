import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/supabase';
import { cookieName, createSession, session } from '@/lib/session';
import { normalizeName } from '@/lib/domain';
import { getSnapshot, getCandidate, mutate, exportDataset } from '@/lib/service';
import { buildWorkbook } from '@/lib/export';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
function fail(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Database operation failed. Please retry.';
  return json(
    { error: message },
    {
      status:
        message === 'UNAUTHENTICATED'
          ? 401
          : message.includes('required') || message.includes('Only')
            ? 403
            : 400,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    if (path[0] === 'snapshot')
      return json(await getSnapshot(req.nextUrl.searchParams.get('cycle') ?? undefined));
    if (path[0] === 'candidate') return json(await getCandidate(path[1]));
    if (path[0] === 'export') {
      const data = await exportDataset(path[1]);
      const buffer = await (await buildWorkbook(data)).xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Temptasians-${data.cycle.id}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    // Same-origin JSON requests only. Identity and unlock cannot be forged by another site.
    if (
      req.headers.get('origin') !== req.nextUrl.origin ||
      !req.headers.get('content-type')?.includes('application/json')
    )
      return json({ error: 'Invalid request origin' }, { status: 403 });
    if (Number(req.headers.get('content-length') ?? 0) > 40000)
      throw new Error('Request too large');
    const { path } = await params;
    const body = await req.json();
    if (path[0] === 'login') {
      const name = normalizeName(z.string().trim().min(1).max(80).parse(body.name));
      const { data, error } = await db().rpc('login_identity', { normalized_name: name });
      if (error) throw new Error(error.message);
      await createSession(data.id);
      return json({ ok: true });
    }
    const s = await session();
    if (path[0] === 'logout') {
      const { error } = await db().from('sessions').delete().eq('token_hash', s.hash);
      if (error) throw error;
      (await cookies()).delete(cookieName);
      return json({ ok: true });
    }
    if (path[0] === 'heartbeat') {
      const { error } = await db()
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', s.user.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (path[0] === 'unlock') {
      const password = z.string().max(200).parse(body.password),
        expected = process.env.ALL_DATA_ACCESS_PASSWORD;
      if (!expected) throw new Error('All-data password is not configured');
      const attempt = await db().rpc('consume_unlock_attempt', { session_hash: s.hash });
      if (attempt.error) throw attempt.error;
      if (!attempt.data) throw new Error('Too many attempts. Wait 15 minutes.');
      const digest = (x: string) => createHash('sha256').update(x).digest();
      if (!timingSafeEqual(digest(password), digest(expected)))
        throw new Error('Incorrect password');
      const { error } = await db()
        .from('sessions')
        .update({ unlocked_until: new Date(Date.now() + 8 * 3600000).toISOString() })
        .eq('token_hash', s.hash);
      if (error) throw error;
      return json({ ok: true });
    }
    if (path[0] === 'mutate')
      return json(await mutate(z.string().parse(body.operation), body.payload ?? {}));
    return json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return fail(e);
  }
}
