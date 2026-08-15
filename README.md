# ASB · Class of 2027

A private crew HQ for ASB: a personalized home screen, a shared calendar, upcoming events with shift assignments, member profiles, spirit-week job lists (with reference images and shared notes), and a club-fair shopping list people can sign up for. Built with Next.js + Supabase, hosted on Vercel. No terminal required.

**How access works:** everyone signs in. Accounts are **invite-only** — you (the admin) create each member's login with a starting password and share it; they can change it later. There's no public signup and no public view.

**Roles:** you're the **admin** (manage events, jobs, shopping, the roster, the banner, and who else is an admin). Everyone else is a **member** (edit their own profile, add notes on jobs, claim shopping items). Admin powers switch on automatically for your account — there's no separate "admin login," just one sign-in for everyone.

**How it stays safe:** the public key in the browser is limited by the database — members can only touch what they're allowed to. Creating, resetting, and removing logins happens on the server with a secret key that never reaches the browser, and only after confirming the caller is an admin.

---

## What you'll need (all free)

- A **GitHub** account, a **Supabase** account, and a **Vercel** account.

## Files

```
package.json   next.config.mjs   jsconfig.json   .gitignore   .env.local.example
app/
  layout.js    globals.css   page.js
  api/admin/route.js       <- server route for invites / resets / removals
lib/
  supabase.js  util.js
supabase/
  schema.sql   <- run once in Supabase
public/
  jh-logo.webp   fonts/bringbold.otf   fonts/recoleta.otf
```

## Step 1 — Code onto GitHub

Unzip, then in a new private repo use **Add file → Upload files** and drag the `asb-next` folder's contents in (Chrome keeps folder structure). Fonts and logo are already included — nothing binary to handle separately. Commit.

## Step 2 — Supabase database

1. **New project** in Supabase (save the DB password).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, **Run**. That builds every table, the security rules, the signup trigger, the announcement banner (with your Natalie/Emily/Victoria default), and the photo buckets.

## Step 3 — Deploy on Vercel

1. **Add New → Project**, import the repo.
2. Add these **Environment Variables** (see `.env.local.example`):

   | Name | Where | Secret? |
   |------|-------|---------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | no |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` key | no |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key | **yes — keep private** |

3. **Deploy.** You'll get a live `*.vercel.app` link.

## Step 4 — Make yourself the admin (one time)

1. Supabase → **Authentication → Users → Add user**. Enter your email + a password, and check **Auto Confirm User**. (This creates your account and profile.)
2. Supabase → **SQL Editor**, run this with your email and name:

   ```sql
   update public.members set is_admin = true, name = 'Dylan'
   where email = 'you@example.com';
   ```

3. Sign in on the site — you'll have the **Admin** badge.

## Step 5 — Run the crew

- **Roster → + Invite member:** enter name + email, share the shown temp password. Repeat for all 14.
- **Events / Calendar:** add events, assign who's working. Assignments show on each member's profile and on their Home screen.
- **Jobs:** add a spirit-week job (posters, windows…), attach a reference image, assign people, drop notes. Assigned members see it on Home; anyone can add notes back.
- **Shopping:** add items for a club fair; members tap "I'll bring it" to sign up. What you're bringing shows on your Home screen.
- **Banner:** the pink bar up top — tap **Edit** to change the message or hide it.

Each member lands on **Home** with "Hi {name} 👋" and everything assigned to them.

---

## Making it your own

- **Colors / fonts:** top of `app/globals.css`.
- **Event types & colors:** `EVENT_TYPES` in `lib/util.js`.
- **Custom domain:** Vercel → project → **Domains**.

## Notes

- Members change their own password under **Edit my profile**. If someone forgets theirs, open their profile as admin and **Reset this member's password** to get a fresh temp one to share.
- To fully remove someone, use **Remove member** in their profile (that deletes their login too).
- The `service_role` key is the sensitive one — it lives only in Vercel's server settings, never in the browser.
