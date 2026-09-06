# Interscholastic League Scoreboard

A website for a school sports league: public schedules, standings, and event
pages, plus a simple dashboard where each school's staff can enter results
and upload photos from their phone right after a game.

This README is written for the **league admin** — the person who runs the
site day-to-day but isn't necessarily a developer. It covers account
management, season/event setup, and deploying updates. A separate,
more technical section at the bottom covers the tech stack for anyone who
picks up development later.

---

## What this site does

- **Public pages** — anyone can view these, no login needed:
  - `/tournaments/[tournament]` — a tournament's front door (e.g. "JV
    Volleyball"): its current season plus a list of past seasons.
  - `/seasons/[season]` — one year's edition of a tournament: schedule and
    standings, or (for tournaments with a Girls/Boys split) links into each
    division.
  - `/seasons/[season]/[division]` — the Girls or Boys schedule/standings
    for that season.
  - `/seasons/[season]/events/[event]` — one game/meet's result, recap, and
    photos.
- **`/login`** — for the 6 school accounts and the admin account(s) only.
- **`/dashboard`** — after logging in: school staff see only their own
  school's games with a button to enter results/photos; the admin sees
  everything, plus tournament/season/event/account management and the
  audit log.

There is no public sign-up. Every account is created by the admin from
`/dashboard/admin/users`.

---

## One-time setup (deploying this site for the first time)

You'll need three free/low-cost accounts:

1. **[Vercel](https://vercel.com)** — hosts the website.
2. **A Postgres database** — [Neon](https://neon.tech) has a generous free
   tier and connects to Vercel with a couple of clicks. (Supabase or
   Railway also work.)
3. **Vercel Blob** (for photo storage) — this is just a tab inside your
   Vercel project, not a separate account.

### Steps

1. **Push this project to a GitHub repository** (ask a developer for help
   with this one-time step if you've never used git — after this, you
   generally won't need to touch git directly again; see "Deploying
   updates" below).
2. **In Vercel:** "Add New Project" → import that GitHub repository.
3. **Create the database:** In your Vercel project, go to the **Storage**
   tab → **Create Database** → choose **Neon (Postgres)**. Vercel will
   automatically add a `DATABASE_URL` environment variable for you.
4. **Create Blob storage:** Still in the **Storage** tab → **Create
   Database** → choose **Blob**. This automatically adds a
   `BLOB_READ_WRITE_TOKEN` environment variable.
5. **Add the remaining environment variables** in **Settings → Environment
   Variables**:
   - `AUTH_SECRET` — a random secret. Generate one at
     [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32)
     and paste it in.
   - `AUTH_URL` — your site's URL once deployed, e.g.
     `https://your-league.vercel.app` (no trailing slash).
6. **Deploy.** Vercel will build and deploy the site automatically.
7. **Run the database migration once**, from your own computer (a
   developer can do this one-time step for you if needed):
   ```bash
   npm install
   # Copy DATABASE_URL and the non-pooling connection string (as
   # Database_POSTGRES_URL_NON_POOLING) from Vercel's Storage tab into a
   # local .env file - migrate deploy needs the direct connection to hold
   # its migration lock, which a pooled DATABASE_URL can't reliably do.
   npx prisma migrate deploy
   ```
8. **Create your admin account.** Still from your computer, with `.env`
   pointed at the production `DATABASE_URL`:
   ```bash
   SEED_ADMIN_EMAIL="you@yourschool.org" \
   SEED_ADMIN_PASSWORD="a-strong-temporary-password" \
   SEED_ADMIN_NAME="Your Name" \
   npm run db:seed
   ```
   Log in at `/login` with those credentials — you'll immediately be asked
   to set your own password.

You only need to do this whole section once. Steps 7 and 8 need a
developer's help if you're not comfortable with the command line, but
everything after this (accounts, seasons, events) is done entirely through
the website.

---

## Managing the 6 school accounts

Go to **Dashboard → Accounts** (`/dashboard/admin/users`).

### Add a school's account

1. Fill in a name (e.g. "Lincoln High Front Office"), the email they'll
   log in with, choose **School editor**, and pick their school.
2. Click **Create account**. A temporary password is shown once — copy it
   and share it with the school directly (phone call or in person is
   safer than email). They'll be asked to set their own password the
   first time they log in.

### Reset a password

Find the account in the list → **Reset password**. Leave the password
field blank to auto-generate one (shown once, same as above), or type a
specific one. This also signs the account out everywhere immediately.

### Disable an account

Find the account → **Disable**. This blocks login immediately, even if
they're already logged in somewhere. Click **Enable** to restore access.
Nothing is deleted — their past edits stay in the history.

### Adding another admin

Use the same **Create account** form and choose **League admin** instead
of **School editor**.

---

## Tournaments, seasons, and divisions

There are three levels, and it's worth knowing the difference:

- **Tournament** — the stable, recurring thing, e.g. "JV Volleyball" or
  "Golf". Its sport, scoring rules, and Girls/Boys split don't change from
  year to year. This is what shows up once in the "All Tournaments" list on
  the home page, and lives at `/tournaments/jv-volleyball`.
- **Season** — one year's *edition* of a tournament, e.g. "Fall 2026". It
  has its own dates and optional host school. This is where the actual
  schedule, results, and photos live, at `/seasons/jv-volleyball-fall-2026`.
- **Division** — the optional Girls/Boys split within a tournament (most
  team sports have one; individual/meet sports like Golf, Swimming, or
  Academic Games, and single-gender sports like Baseball/Softball, don't).

### Creating a tournament

**Dashboard → Tournaments → Create a tournament.** Give it a name, a URL
slug (permanent — this doesn't change year to year), the sport, and choose
how results are scored:

- **Win / loss / draw per game** — most team sports. Also set how many
  points a win/draw/loss is worth (e.g. 3/1/0 for soccer).
- **Team + individual score, lowest wins** — for sports like golf that
  rank both a team score and each athlete's own score. Editors get an
  "Individual scores" mini-list under their school's team score.
- **No standings table** — for meets and festivals (swimming, track,
  academic/arts competitions) that aren't naturally win/loss. Editors get
  a "Results document" upload instead of score fields, for posting a PDF
  of full results.

Check **Girls**/**Boys** to split it into divisions, or uncheck both for a
single combined tournament.

### Starting a season (and archiving the last one)

A tournament needs at least one season before you can add events. From
**Dashboard → Tournaments**, find the tournament and click **Create first
season** (or **Start new season** in later years). Give it a name (e.g.
"Fall 2026"), dates, and optionally a host school.

**Starting a new season automatically archives the old one** — nothing is
deleted. The previous season's schedule, results, and photos stay exactly
as they were, permanently reachable from the tournament's page under "Past
seasons." Only one season per tournament is ever "current" (the one shown
by default and where new events should go).

### Adding events

**Dashboard → + New event.** Pick the season (labeled "Tournament —
Season," e.g. "JV Volleyball — Fall 2026"), a division if the tournament
has one, date/time, location, and check off which schools are playing.
Once created, it immediately appears on the public schedule and on the
dashboards of every school involved.

Standings are calculated automatically from results — you never type in a
standings table directly.

---

## Managing schools

**Dashboard → Schools** lets you add a school (name, contact info, logo)
or edit an existing one. This is separate from creating that school's
*login account* — add the school here first, then create its account
under **Accounts**.

---

## The audit log

**Dashboard → Audit log** (admin only) shows every result, photo, and
account change: who did it and when. On an individual event's edit page,
you'll also see that event's history with a **Revert to this** button next
to result/detail changes — use it to undo a mistake without needing a
developer. Nothing can be deleted from this log through the app; it's a
permanent record.

---

## Deploying updates

Once the site is live, making a change (e.g. asking a developer to tweak
something, or updating the code yourself) works like this:

1. The change is committed and pushed to the GitHub repository (on the
   `main` branch, or whatever branch Vercel is watching).
2. Vercel automatically detects the push, builds the new version, and
   rolls it out — usually within a minute or two, with no downtime.
3. If a change ever adds a new field to the database, run
   `npx prisma migrate deploy` once against the production database (same
   as step 7 in the setup section) before or right after that deploy.

You can watch deploys and roll back to a previous version from the
**Deployments** tab in Vercel if something goes wrong.

---

## Keeping dependencies up to date

This project uses actively-maintained libraries (Next.js, Prisma, Auth.js,
etc). To keep them current:

```bash
npm outdated        # see what's behind
npm update           # apply safe (non-breaking) updates
npm audit            # check for known vulnerabilities
```

Do this every few months, or whenever `npm audit` reports something
serious. Test locally (`npm run dev`) and check the build (`npm run
build`) before pushing an update. Major version bumps (e.g. Next.js 16 →
17) are worth doing but should be tested carefully — consider asking a
developer for help with those.

---

## Backups

Managed Postgres providers (Neon, Supabase, Railway) take automatic
backups / point-in-time recovery by default — check your provider's
dashboard to confirm this is enabled and note how far back you can
restore. As a supplementary manual backup, you can export the whole
database at any time with:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```

Uploaded photos live in Vercel Blob, which is durable storage independent
of the database.

---

## Security notes (for whoever maintains this)

- Passwords are hashed with bcrypt; nothing is ever stored in plain text.
- Every write (results, photos, account changes) re-checks the acting
  user's role and school on the server — the UI hiding a field is not the
  security boundary.
- Logins lock out for 15 minutes after 5 failed attempts on that account,
  and there's a lightweight best-effort per-IP rate limit on top of that.
  The account lockout is the durable defense; the IP rate limit is
  defense-in-depth and — because it's in-memory — only fully effective
  within a single serverless instance.
- Sessions are stored in httpOnly, secure, SameSite cookies and expire
  after 12 hours; disabling an account or resetting its password
  invalidates its sessions immediately.
- Uploaded photos are re-encoded (resized, converted to JPEG) on the
  server before storage — this strips embedded metadata (like GPS EXIF
  data) and neutralizes disguised non-image files, regardless of what
  extension or content-type they were uploaded with.
- Security headers (CSP, HSTS, X-Frame-Options, etc.) are set in
  `src/proxy.ts` and `next.config.ts`.
- All secrets live in environment variables (set in Vercel's dashboard),
  never in the code or the repository.

---

## Tech stack (for developers)

- **Next.js** (App Router, TypeScript) — deployed on Vercel.
- **PostgreSQL** via **Prisma ORM** — schema in `prisma/schema.prisma`.
- **Auth.js (NextAuth v5)** with a Credentials provider — see
  `src/lib/auth.ts` and `src/lib/session.ts`.
- **Vercel Blob** for photo storage; **sharp** re-encodes/resizes images
  server-side on upload (`src/lib/photo-upload.ts`).
- **Zod** for server-side input validation (`src/lib/validation.ts`).
- **Tailwind CSS** for styling.

### Local development

```bash
npm install
cp .env.example .env   # fill in a local DATABASE_URL, Database_POSTGRES_URL_NON_POOLING, AUTH_SECRET, etc.
npx prisma migrate dev
npm run db:seed         # creates the first admin account from env vars
npm run dev
```

### Project structure

- `src/app/` — pages and API routes (App Router).
- `src/lib/actions/` — server actions (all writes go through here; each
  one re-validates auth/role/school scoping and writes an audit log entry).
- `src/lib/session.ts` — `requireUser` / `requireAdmin` /
  `requireSchoolAccess` helpers used by every protected page and action.
- `src/lib/standings.ts` — standings are computed from `Result` rows on
  every read, not cached in a separate table.
- `src/components/` — client components (forms with `useActionState`,
  photo uploader, etc).
