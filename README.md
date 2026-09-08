# Temptasians Audition Council

An internal audition workspace for Duke’s Asian cultural a cappella group. Next.js App Router, TypeScript, React, Tailwind CSS, Supabase PostgreSQL, Supabase Realtime, Zod, dnd-kit, and ExcelJS. The running application always reads and writes PostgreSQL; there is no demo-data or localStorage persistence mode.

## What you need

- Node.js **22 LTS or 24 LTS**, npm, Git, a GitHub account, and a Vercel account.
- A **separate development Supabase project**, then a production project when ready.
- A PostgreSQL connection string for applying migrations/backups. The app itself uses Supabase’s HTTPS database API, not a direct database connection.

## Local setup

```sh
git clone <your-repository-url>
cd tazns_audition
npm ci
cp .env.example .env.local
```

1. Create a project at [Supabase](https://supabase.com/dashboard). Save its database password in a password manager. Choose a region near your users.
2. In the project’s **Connect** dialog or **Settings → API**, copy the Project URL and legacy `anon` key. Under API keys, reveal the **service_role** key. This key bypasses RLS: keep it on the server.
3. Fill `.env.local` (never commit it):

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ALL_DATA_ACCESS_PASSWORD=TAZNS
   DATABASE_URL=postgresql://postgres.your-project:URL_ENCODED_PASSWORD@your-session-pooler-host:5432/postgres
   ```

   Copy the actual **Session pooler** connection string from Connect; do not guess the host. Direct connections also work if your network supports their IP version. URL-encode special characters in the database password. `DATABASE_URL` is only required by scripts, not by the deployed app.

4. Apply the migration:

   ```sh
   npm run db:migrate
   ```

   This applies new files in `supabase/migrations` in transactions and records them in `app_migrations`. Do not modify already-applied migrations; add another migration. Alternatively, for the first setup only, paste `supabase/migrations/202609070001_initial.sql` into Supabase’s SQL Editor and run it. If you used the SQL Editor, do **not** subsequently run the initial migration again through the script; use the script from the start when possible.

5. In Supabase **Database → Replication**, confirm the `supabase_realtime` publication includes **only `change_signal` from this application**. The migration adds it automatically. Keep `evaluations`, `team_deliberations`, `candidates`, `sessions`, and `audit_events` out of that publication. Do not enable replication indiscriminately for every table.
6. Optional, on an **empty development project only**:

   ```sh
   CONFIRM_DEV_SEED=yes npm run db:seed
   ```

   This explicitly inserts Lucas, Admin, Alice, Ben, Chloe, and sample candidates. The script refuses to seed a database that already has a cycle. Nothing seeds automatically.

7. Start:

   ```sh
   npm run dev
   ```

8. Open <http://localhost:3000/login>. Enter `Lucas` to create/restore the procedural admin. Use a private window or separate browser profile for `Alice`. Two tabs in the **same browser profile share the same identity cookie**; separate profiles are necessary for independent identities.

Without Supabase configuration, the app reports a setup/connection error. It never silently replaces the database with browser storage.

## Identity, sessions, and privacy

This is intentionally **lightweight identity, not secure personal authentication**. Anyone who can reach the app can enter another person’s name; anyone entering Lucas or Admin gets admin privileges. Use this only within the trusted council, and limit distribution of the deployment URL. If you need protection against impersonation, replace name login with verified authentication before opening access more broadly.

Names are trimmed, whitespace collapsed, and sensibly capitalized. UUIDs are relational keys. Lucas/Admin elevation is applied at login in the database; procedural checks read `users.is_admin`.

Login creates a random 256-bit session token in an HttpOnly, SameSite=Strict cookie (Secure in production). Only its SHA-256 hash is stored in PostgreSQL. Sessions last 30 days; Switch User revokes the current session and removes its cookie. The browser never chooses a user UUID in a mutation. Access All Data verifies a **server-only** password and sets an eight-hour read unlock on that session. It grants no procedural or extra write rights. Unlock attempts are limited to ten per session per 15 minutes; this is a trusted-group deterrent, not an internet-grade login abuse defense.

Every API read authenticates the session and applies centralized visibility checks. Own reviews are selected by the session user UUID. During auditions no query fetches peers’ detailed evaluations for an ordinary request. Completed-candidate summaries explicitly select **only `judge_user_id, overall_rating`**. Deliberation or a successful all-data unlock enables full peer details. Admin status alone does not grant detailed peer reads through the normal review API. Export is intentionally privileged and available to admins or unlocked sessions.

All domain tables have RLS enabled, no public read/write policies, and no `anon`/`authenticated` grants. Only the server’s service-role client can access them. Mutations call a service-role-only PostgreSQL RPC, which validates actor permissions, state transitions, and field allowlists inside a transaction. Same-origin JSON enforcement prevents cross-site mutation requests. Never add public policies to evaluations to “fix” a frontend error.

## Data architecture

- `users`: stable council identities and admin flag; heartbeat tracks activity within five minutes for note-taker selection.
- `sessions`: hashed identity tokens, expiration, all-data unlock, attempt limits.
- `audition_cycles`: independently retained seasons; a partial unique index allows one active cycle.
- `candidates`: ordered factual profiles, state, exclusion flag, note taker, board placement. One active non-excluded candidate per cycle is enforced by a partial unique index.
- `evaluations`: explicit nullable rating columns and optional notes, primary key `(candidate_id, judge_user_id)`.
- `team_deliberations`: separate shared ratings/notes keyed by candidate, plus editing metadata.
- `audit_events`: procedural history and field-change metadata, without duplicating private note bodies into the audit log.
- `change_signal`: one content-free revision number for realtime invalidation.
- `app_migrations`: migration-script bookkeeping.

`lib/service.ts` owns database reads and mutation validation; components call `lib/client.ts`. `lib/domain.ts` provides shared types, schemas, and permission predicates. `lib/database.types.ts` describes the schema to Supabase’s typed client. Atomic SQL procedures live in the migration. Cycle-level row locks serialize procedural actions and shared edits; at eight judges this is deliberately simple. Field changes update exactly one whitelisted column, with last-write-wins for the same shared field. Candidate exclusion never deletes records.

## Autosave and realtime

Ratings write immediately. Text updates the UI immediately, then saves after **700 ms** idle or on blur. Each field has an ordered request queue: a slow older request cannot arrive after a newer write. Save status is shown per field. Failed text remains in memory, stays protected from incoming stale data, retries twice with backoff, and offers a manual Retry button. Navigating through links or switching users flushes pending queues first; page close/refresh warns while edits are unsaved. Hiding the document also attempts a flush. There is **no durable offline queue**: do not close an offline browser containing failed saves; reconnect, retry, and wait for Saved. PostgreSQL is durable after acknowledgment, not before the browser successfully sends a write.

Triggers update a singleton revision after saved domain changes. Supabase Realtime publishes **only that revision**. It contains no names, candidate IDs, ratings, or notes. Clients respond by fetching their authorized API view. Thus private evaluation payloads are never published. Revision timing is publicly observable, but no audition content is. Focus/reconnect refreshes and a 15-second fallback poll recover missed notifications. A 60-second heartbeat supports note-taker selection. The UI reports Live sync or Reconnecting. Own writes also trigger an immediate authorized refresh.

Reference: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation).

## Audition operating guide

1. Council members enter their own names in separate browser profiles/laptops.
2. Lucas/Admin opens Manage cycles, creates a cycle, and activates it.
3. Preload first/last names with New candidate. Use the up/down controls on laptop to set audition order.
4. Open an upcoming candidate, select a recently connected Personal Info Note Taker, and Start candidate.
5. The note taker completes first/last name, class, major, hometown, celebrity crush, and four MBTI selections. Each field autosaves. Other judges wait.
6. Click Begin Vocal Audition. Required factual fields are checked in PostgreSQL. An admin can Force advance when necessary.
7. Each judge independently records ratings and optional notes. Main tabs: Range, Pitch Matching, Blending, Solo, Overall. Vibe stays pinned on the right on laptop. Unset is always valid.
8. Expand Candidate profile for collaborative factual updates, voice sections, and cultural origins after Personal Info. Hometown and origin remain separate.
9. Admin closes the audition. Everyone sees council Overall colors, while detailed peer feedback remains private. Completed reviews remain editable.
10. Repeat. Exclude removes a candidate from ordinary views without deleting data; admins can restore them. A restore that would create two active auditions is rejected—close/exclude the other active audition first.
11. Admin starts Deliberations. Every non-excluded candidate appears, even candidates who never completed or started an audition. Initial placement is Undecided; existing placements are retained.
12. Open candidate cards for the complete judge matrix and the separate sticky Team deliberation editor. Team Overall appears on the card.
13. Any judge may move a card by its drag handle or accessible destination select. Accepted lanes are Soprano, Alto, Tenor, Bass; Undecided and Rejected are reversible. There is no final lock. Writes are acknowledged before the displayed placement changes; failures show an error and keep the persisted placement.
14. Export XLSX from the dashboard, board, or unlocked All Data page.
15. Select old cycles from the sidebar to read their retained data. Individual completed reviews remain editable as required; activating another cycle does not delete them.

## Excel export

An admin or unlocked session opens `/api/export/<cycle UUID>` via Export XLSX. The server freshly queries the database. One workbook contains **Summary first**, then one candidate sheet in explicit audition order, including excluded candidates. Summary contains factual profile, exclusion/state, board placement, and every team rating/note. Candidate sheets include profiles, all known judges (unset if no review), individual feedback, shared team feedback, and outcomes. Sheet names are sanitized, capped at 31 characters, and made case-insensitively unique. Component ratings use light fills; Overall uses stronger fills. Headers are bold, notes wrap, columns have usable widths, and the first row is frozen. Strings are written as strings, never interpreted as formulas.

## Vercel deployment

1. Create a production Supabase project. Configure it and apply migrations using the steps above, with production credentials. **Do not seed production.**
2. Push this repository to your GitHub repository (do not push `.env.local`).
3. In Vercel, choose **Add New → Project**, import the GitHub repository, and accept the detected Next.js framework preset. Choose Node.js 22 or 24.
4. In Project Settings → Environment Variables, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALL_DATA_ACCESS_PASSWORD`
5. The first two values are intentionally public; the last two **must not** have `NEXT_PUBLIC_` prefixes. Do not add `DATABASE_URL` to Vercel unless you introduce a feature that actually needs it. Configure Preview deployments to a development database, not production.
6. Deploy. After changing public variables, redeploy because Next.js embeds them at build time.
7. Open the production URL in two separate browser profiles. Run the verification checklist below before live auditions. Use the exact deployed origin for requests; do not place the API behind a separate cross-origin URL.
8. Future pushes to the production branch redeploy Next.js. Apply new database migrations separately before shipping code that requires them. **Redeploying Next.js does not erase Supabase PostgreSQL data.**

The workload is small, but check Supabase/Vercel plan limits, project availability, and current billing in their dashboards before audition day. Realtime is not a substitute for availability checks or backups.

## Backups and restore

Install a `pg_dump`/`pg_restore` version compatible with the database (prefer the same major version; Supabase shows its PostgreSQL version). On macOS, `brew install libpq` provides these tools; add its `bin` directory to PATH as Homebrew instructs. Retrieve the production **direct or session pooler** connection string from Supabase Connect. Do not use the transaction pooler for these operations.

In a private terminal, use a temporary environment variable; avoid placing the password directly in shell history:

```sh
read -s TAZNS_DATABASE_URL
export TAZNS_DATABASE_URL
mkdir -p "$HOME/PrivateBackups/temptasians"
pg_dump --dbname="$TAZNS_DATABASE_URL" --format=custom --no-owner --no-acl \
  --schema=public --file="$HOME/PrivateBackups/temptasians/auditions-before-session.dump"
unset TAZNS_DATABASE_URL
```

Paste the connection string at the hidden prompt and press Enter. Use a new descriptive filename every time. The dump includes this app’s public schema and data, including sessions. Store it on an encrypted drive with access restricted to the council organizers, and keep a second encrypted copy separate from your laptop. Never commit dumps. XLSX is useful for analysis, but is not a full database backup.

Operating practice: before an audition session, verify the app/database and create a dump; after the session, export XLSX and make another dump; after deliberation, export final XLSX and make a final dump.

**Restore into a new, empty Supabase project first**, not on top of live audition data:

```sh
read -s TAZNS_RESTORE_DATABASE_URL
export TAZNS_RESTORE_DATABASE_URL
pg_restore --dbname="$TAZNS_RESTORE_DATABASE_URL" --no-owner --no-acl \
  --exit-on-error --single-transaction \
  "$HOME/PrivateBackups/temptasians/auditions-before-session.dump"
unset TAZNS_RESTORE_DATABASE_URL
```

Do not apply the initial migration before restoring: the dump contains the table/function definitions. Because `--no-acl` omits grants and a schema-filtered dump does not restore publication membership, run **`scripts/restore-access.sql` in the new project’s SQL Editor** after restore. It reinstates public-role restrictions, server grants, function permissions, and the single allowed realtime publication member. It also clears restored sessions so old session tokens cannot be reused. The restored migration-history table prevents reapplying the initial migration if you originally used the migration script.

Verify row counts and sample notes/ratings, test login and the complete workflow, and export a fresh workbook. Then update Vercel’s four environment values to the restored project and redeploy. Retain the original project until recovery is verified. Avoid destructive `--clean` restores into production without a separate verified backup.

## Recovery if the frontend fails

Open Supabase’s Table Editor or SQL Editor independently of Vercel:

```sql
select name, is_active, mode from public.audition_cycles;
select audition_order, first_name, last_name, state, excluded
from public.candidates order by audition_cycle_id, audition_order;
select candidate_id, judge_user_id, updated_at from public.evaluations;
```

Check expected rows and recent `updated_at` timestamps. Use private SQL inspection for actual notes; do not paste evaluations into public logs. Check Vercel function logs and environment values, and redeploy known-good frontend code if necessary. Database data remains in Supabase. If the database itself needs recovery, use the tested dump workflow above.

## Tests and quality checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
# After configuring a DEVELOPMENT Supabase project:
npm run test:hosted
```

`tests/database.test.ts` applies the production migration to **PGlite’s real PostgreSQL engine** and tests SQL constraints, procedures, permissions, field-level updates, inclusion rules, board outcomes, and durable unlock attempt limits. Its harness creates Supabase roles and skips the publication statement because embedded PostgreSQL does not run Supabase’s Realtime service. These tests do not certify hosted Supabase connectivity or websocket delivery.

`tests/service.test.ts` checks returned payloads **and selected database columns**, including admin privacy, completion Overall-only reads, deliberation/unlock, and exclusion. `tests/autosave.test.ts` covers debounce, immediate writes, serialization, retries, and preservation of unsaved text. Domain tests cover identity/authorization/null ratings. Export tests check workbook ordering, naming, and formatting. Playwright interface tests use explicit HTTP fixtures to inspect layout and save failure behavior; fixtures are never used by the running development application.

`npm run test:hosted` opts into a real two-browser integration test against the configured development project. It creates a retained `Verification <timestamp>` cycle, restores the previously active cycle afterward, and verifies stored reviews, privacy, live transitions, exclusion/restoration, board persistence, team separation, and a fresh workbook. It is skipped by default. Never point this test at your live audition project.

### Required two-browser Supabase acceptance check

Perform this against the configured development deployment, then repeat a small smoke test in production. These are external integration checks, not replaced by fixtures:

- Browser A logs in as Lucas; Browser B logs in as Alice (separate profiles).
- Create/activate a cycle and candidate; B receives the queue update without refresh.
- Lucas selects Alice as note taker and starts; both see Personal Info.
- Alice fills every required field and begins Vocal Audition; both transition without refresh.
- Alice writes notes and selects a rating. Confirm the row and values in Supabase, wait for Saved, refresh B, and confirm the review survives.
- In B’s Network panel inspect snapshot/candidate responses: no Lucas component ratings or notes. Try direct REST reads with the anon key: permission denied. Realtime frames contain only `change_signal` revision data.
- Close as Lucas. B sees only council Overall colors. Change an Overall in a completed review; A sees the new allowed color.
- Temporarily block `/api/mutate` using browser devtools request blocking. Type a note, blur, confirm visible failure and retained text, unblock, Retry, confirm stored value. Never refresh before a failed write is resolved.
- Exclude as Lucas; B loses the candidate in queue/history/board and cannot fetch its detail. Restore and confirm records remain.
- Start Deliberations, including an upcoming candidate. B sees details; all non-excluded candidates appear Undecided regardless of state.
- Move a card in B; A sees it update without refresh. Refresh both and verify the location survives. Reverse the move.
- Change shared Team Overall/notes; both board cards/workspaces update. Check individual evaluations remain unchanged.
- Unlock All Data as Alice: inspect exclusions/details, but confirm admin operations still fail. Switch User and confirm unlock disappears.
- Export, open the XLSX, verify Summary first, candidate order, exclusions, all judge notes, and independent team data.
- Activate a new cycle and select the old one; old data remains readable.

## Important files

- `app/api/[...path]/route.ts`: session-based HTTP boundary and server export.
- `lib/service.ts`, `lib/session.ts`, `lib/supabase.ts`: trusted server data layer.
- `lib/domain.ts`, `lib/database.types.ts`: validation, permission rules, typed schema.
- `supabase/migrations/202609070001_initial.sql`: authoritative schema and atomic mutation procedures.
- `lib/autosave.ts`, `components/fields.tsx`: ordered field saves and accessible inputs.
- `components/realtime.tsx`: content-free subscription plus reconciliation.
- `components/workspace.tsx`, `review.tsx`, `profile.tsx`, `board.tsx`: council UI.
- `lib/export.ts`: styled workbook generator.
- `scripts/`: migrations, explicit development seed, restore permissions.
- `tests/`: database, privacy, autosave, export, and browser checks.

## Practical limits

Same-name login is intentionally impersonable. Same-field collaborative edits use last-write-wins. Unsaved offline edits survive in the current page only, with warnings/retries. Live sync requires the hosted publication and working websocket connectivity; the UI falls back to periodic authorized reads. No recording consent is stored. No candidate is deleted through the UI. There is no final lock. Review privacy, workflow permissions, and durable server storage take precedence over decoration.
