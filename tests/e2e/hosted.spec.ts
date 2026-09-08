import { test, expect, type BrowserContext } from '@playwright/test';
import ExcelJS from 'exceljs';
// Explicit opt-in only: this creates retained verification data in a DEVELOPMENT project.
test.skip(
  process.env.RUN_HOSTED_E2E !== 'yes',
  'Configure a development Supabase project and opt in with npm run test:hosted.',
);
test('two real identities: durable autosave, privacy, realtime workflow, board and export', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  const lucas = await a.newPage(),
    alice = await b.newPage();
  const post = async (ctx: BrowserContext, path: string, body: unknown) => {
    const r = await ctx.request.post(`${baseURL}/api/${path}`, {
      data: body,
      headers: { Origin: baseURL! },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const mutate = (ctx: BrowserContext, operation: string, payload: Record<string, unknown>) =>
    post(ctx, 'mutate', { operation, payload });
  let previous: string | undefined;
  try {
    await lucas.goto('/login');
    await lucas.getByRole('textbox', { name: 'Your name' }).fill('Lucas');
    await lucas.getByRole('button', { name: 'Enter council' }).click();
    await expect(lucas.getByRole('heading', { name: 'Audition dashboard' })).toBeVisible();
    await alice.goto('/login');
    await alice.getByRole('textbox', { name: 'Your name' }).fill('Alice');
    await alice.getByRole('button', { name: 'Enter council' }).click();
    await expect(alice.getByRole('heading', { name: 'Audition dashboard' })).toBeVisible();
    const original = await (await a.request.get(`${baseURL}/api/snapshot`)).json();
    previous = original.cycle?.id;
    const cycle = await mutate(a, 'createCycle', {
      name: `Verification ${new Date().toISOString()}`,
    });
    await mutate(a, 'activateCycle', { id: cycle.id });
    await expect(alice.getByText(cycle.name, { exact: false }).first()).toBeVisible({
      timeout: 10000,
    });
    const c = await mutate(a, 'createCandidate', {
      cycleId: cycle.id,
      first_name: 'Verification',
      last_name: 'Singer',
    });
    const upcoming = await mutate(a, 'createCandidate', {
      cycleId: cycle.id,
      first_name: 'Upcoming',
      last_name: 'Singer',
    });
    const s = await (await b.request.get(`${baseURL}/api/snapshot`)).json();
    await mutate(a, 'start', { id: c.id, noteTakerId: s.user.id });
    await alice.goto(`/candidate/${c.id}`);
    await lucas.goto(`/candidate/${c.id}`);
    for (const [label, value] of [
      ['Major', 'Computer Science'],
      ['Hometown', 'Durham'],
      ['Celebrity crush', 'Someone'],
    ])
      await alice.getByRole('textbox', { name: label, exact: false }).fill(value);
    await alice.getByLabel('Class *').selectOption('2029');
    for (const [i, letter] of [...'ENFP'].entries())
      await alice.getByRole('combobox', { name: `MBTI letter ${i + 1}` }).selectOption(letter);
    await alice.getByRole('button', { name: 'Begin Vocal Audition', exact: true }).click();
    await expect(lucas.getByRole('textbox', { name: 'Range notes' })).toBeVisible({
      timeout: 10000,
    });
    await alice.getByRole('textbox', { name: 'Range notes' }).fill('Alice persisted observation');
    await alice.getByRole('textbox', { name: 'Vibe notes' }).click();
    await expect
      .poll(async () => {
        const r = await b.request.get(`${baseURL}/api/candidate/${c.id}`);
        return (await r.json()).own?.range_notes;
      })
      .toBe('Alice persisted observation');
    await alice.reload();
    await expect(alice.getByRole('textbox', { name: 'Range notes' })).toHaveValue(
      'Alice persisted observation',
    );
    await mutate(a, 'patch', {
      id: c.id,
      target: 'evaluation',
      field: 'solo_notes',
      value: 'LUCAS PRIVATE NOTE',
    });
    const privateResponse = await (await b.request.get(`${baseURL}/api/candidate/${c.id}`)).text();
    expect(privateResponse).not.toContain('LUCAS PRIVATE NOTE');
    const denied = await b.request.post(`${baseURL}/api/mutate`, {
      headers: { Origin: baseURL! },
      data: { operation: 'close', payload: { id: c.id } },
    });
    expect(denied.ok()).toBe(false);
    await mutate(a, 'patch', {
      id: c.id,
      target: 'evaluation',
      field: 'overall_rating',
      value: 'GREEN',
    });
    await mutate(a, 'close', { id: c.id });
    await expect(alice.getByRole('heading', { name: 'Council Overall colors' })).toBeVisible({
      timeout: 10000,
    });
    const completed = await (await b.request.get(`${baseURL}/api/candidate/${c.id}`)).json();
    expect(completed.peers).toEqual([]);
    expect(
      completed.overalls.some((r: { overall_rating: string }) => r.overall_rating === 'GREEN'),
    ).toBe(true);
    await mutate(a, 'exclude', { id: c.id });
    await expect(alice.getByRole('heading', { name: 'Verification Singer' })).toHaveCount(0, {
      timeout: 10000,
    });
    await mutate(a, 'restore', { id: c.id });
    await expect(alice.getByRole('heading', { name: 'Verification Singer' })).toBeVisible({
      timeout: 10000,
    });
    await mutate(a, 'deliberate', { cycleId: cycle.id });
    await alice.goto('/deliberation');
    await lucas.goto('/deliberation');
    await expect(alice.getByRole('link', { name: 'Upcoming Singer' })).toBeVisible();
    await alice.getByRole('combobox', { name: 'Move Verification Singer' }).selectOption('Alto');
    await expect(lucas.getByRole('combobox', { name: 'Move Verification Singer' })).toHaveValue(
      'Alto',
      { timeout: 10000 },
    );
    await lucas.reload();
    await expect(lucas.getByRole('combobox', { name: 'Move Verification Singer' })).toHaveValue(
      'Alto',
    );
    await mutate(b, 'patch', { id: c.id, target: 'team', field: 'overall_rating', value: 'RED' });
    await expect(
      lucas
        .locator('.board-card')
        .filter({ hasText: 'Verification Singer' })
        .locator('.team-overall'),
    ).toContainText('RED', { timeout: 10000 });
    const detailed = await (await b.request.get(`${baseURL}/api/candidate/${c.id}`)).json();
    expect(JSON.stringify(detailed.peers)).toContain('LUCAS PRIVATE NOTE');
    expect(detailed.team.overall_rating).toBe('RED');
    await mutate(b, 'move', { id: upcoming.id, status: 'REJECTED', section: null });
    const workbook = await a.request.get(`${baseURL}/api/export/${cycle.id}`);
    expect(workbook.ok()).toBe(true);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await workbook.body()) as unknown as never);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      'Summary',
      '1 Verification Singer',
      '2 Upcoming Singer',
    ]);
  } finally {
    if (previous) await mutate(a, 'activateCycle', { id: previous });
    await a.close();
    await b.close();
  }
});
