import { test, expect } from '@playwright/test';
// Isolated interface tests use explicit fixtures. The running app has no fixture fallback.
const id = '00000000-0000-4000-8000-000000000020';
const candidate = {
  id,
  audition_cycle_id: 'cycle',
  audition_order: 1,
  first_name: 'Jane',
  last_name: 'Doe',
  class_year: '2029',
  major: 'Music',
  hometown: 'Durham',
  celebrity_crush: 'Someone',
  mbti: 'ENFP',
  primary_section: null,
  secondary_section: null,
  origin_1: null,
  origin_2: null,
  origin_1_other: '',
  origin_2_other: '',
  state: 'VOCAL_AUDITION',
  excluded: false,
  deliberation_status: 'UNDECIDED',
  accepted_section: null,
};
const user = {
  id: 'alice',
  display_name: 'Alice',
  is_admin: false,
  last_seen_at: new Date().toISOString(),
};
const cycle = { id: 'cycle', name: 'Fall 2026', mode: 'AUDITION', is_active: true };
test('live editor keeps Vibe pinned and saves one changed field, including failure and retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let fail = true;
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/snapshot'))
      return route.fulfill({
        json: {
          user,
          unlocked: false,
          cycles: [cycle],
          cycle,
          candidates: [candidate],
          users: [user],
          team: [],
        },
      });
    if (url.includes('/candidate/'))
      return route.fulfill({
        json: { candidate, cycle, own: null, peers: [], overalls: [], team: null },
      });
    if (url.includes('/mutate')) {
      const body = route.request().postDataJSON();
      payloads.push(body.payload);
      if (fail) return route.fulfill({ status: 500, json: { error: 'Simulated offline' } });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/candidate/${id}`);
  await expect(page.getByRole('heading', { name: 'Jane Doe' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Vibe notes' }).fill('Warm and attentive');
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Vibe notes' })).toHaveValue('Warm and attentive');
  await expect(page.getByRole('button', { name: 'Save failed · Retry' })).toBeVisible();
  const vibe = await page.locator('aside.vibe').boundingBox(),
    main = await page.locator('.review-grid>div').boundingBox();
  expect(vibe!.x).toBeGreaterThan(main!.x + main!.width);
  fail = false;
  await page.getByRole('button', { name: 'Save failed · Retry' }).click();
  await expect(page.getByRole('button', { name: 'Save failed · Retry' })).toHaveCount(0);
  expect(
    payloads.every(
      (p) =>
        p.field === 'vibe_notes' && p.target === 'evaluation' && p.value === 'Warm and attentive',
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/live-review.png', fullPage: true });
});
test('identity entry uses no existing-user dropdown', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Let’s get you settled.' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/login.png', fullPage: true });
});
