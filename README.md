# ASB · Class of 2027

A private HQ for the ASB crew: a shared calendar, an upcoming-events list, member profiles with photos, and shift assignments that show up on each member's page. Built with Next.js + Supabase, hosted on Vercel. No terminal required — everything below happens in the browser.

**How access works:** anyone with the link can view the calendar, events, and roster — no sign-in. Officers click **Officer login** and enter one shared passcode to add/edit events, manage the roster, and assign shifts. No per-person accounts.

**How it stays safe:** the public key that ships to browsers is **read-only** (enforced by the database). Every edit goes through a small server route that checks the passcode and writes with a secret key that never leaves the server. So even someone poking around in dev tools can't change your data without the passcode.

---

## What you'll need (all free)

- A **GitHub** account (to hold the code)
- A **Supabase** account (database + photo storage)
- A **Vercel** account (hosting)

---

## Step 1 — Put the code on GitHub

You have a zip of this whole project. Either:

- **Unzip it, then** in a new (private) GitHub repo use **Add file → Upload files** and drag the unzipped `asb-next` folder's contents in. In Chrome you can drag whole folders and the structure is kept. Commit.

Keep the folder structure exactly as-is. The files in `public/` (the logo and two fonts) are already included in the zip — no need to handle them separately.

Folder layout:

```
package.json      next.config.mjs   jsconfig.json   .gitignore   .env.local.example
app/
  layout.js       globals.css       page.js
  api/admin/route.js      <- server route that performs edits
lib/
  supabase.js     util.js
supabase/
  schema.sql      <- run this in Supabase once
public/
  jh-logo.webp
  fonts/bringbold.otf   fonts/recoleta.otf
```

## Step 2 — Create the Supabase project + database

1. In Supabase, **New project** (save the database password it asks for).
2. When it's ready: **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**. That creates the tables, makes them public-readable, and sets up the `avatars` photo bucket.

## Step 3 — Deploy on Vercel

1. In Vercel, **Add New → Project**, import your GitHub repo.
2. Open **Environment Variables** and add these four (see `.env.local.example`):

   | Name | Where to find it | Secret? |
   |------|------------------|---------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | no |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` key | no |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key | **yes — keep private** |
   | `OFFICER_CODE` | you choose it — this is the officer passcode | **yes** |

3. **Deploy.** You'll get a live `*.vercel.app` link.

> If you ever change `OFFICER_CODE`, update it in Vercel and redeploy (or just save — Vercel redeploys on env changes).

## Step 4 — Load it up

1. Open the site. Click **Officer login**, enter your `OFFICER_CODE`.
2. Go to **Roster → + Add member** and add the crew (name, role, photo).
3. Go to **Events → + Add event**, pick a type and date, and check who's working it. Assignments show on each member's profile under "Upcoming shifts."
4. Share the link with everyone — they can view without any login.

---

## Making it your own

- **Colors / fonts:** top of `app/globals.css` (`--pink`, `--cream`, and the two `@font-face` blocks).
- **Event types & colors:** the `EVENT_TYPES` array in `lib/util.js`.
- **Officer passcode:** the `OFFICER_CODE` env var in Vercel.
- **Custom domain** (e.g. `asb.yourdomain.com`): add it in Vercel under the project's **Domains** tab.

## Notes

- Because there's no login, the officer passcode is the one thing protecting edits — share it only with officers, and pick something not-obvious.
- The `anon` key is fine to be public; the database blocks it from writing. The `service_role` key is the sensitive one — it lives only in Vercel's server env, never in the browser bundle.
