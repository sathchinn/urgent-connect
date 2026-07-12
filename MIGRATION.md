# Migrating TickBell to Your Own Supabase Project

This guide moves TickBell off Lovable Cloud onto a Supabase project you own.
Once done, the app depends on **nothing from Lovable at runtime** — only your
Supabase project and whatever static host you deploy the frontend to.

---

## 1. Create a new Supabase project

1. Go to <https://supabase.com> and sign up (free tier is enough to start).
2. Click **New project**. Pick a strong DB password and a region close to your users.
3. Wait ~2 minutes for provisioning.

## 2. Run the schema

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this repo and paste the entire file into the editor.
3. Click **Run**. It should complete with no errors.

This creates: `profiles`, `groups`, `group_members`, `messages`, `bells`,
`bell_responses`, all helper functions, the `handle_new_user` trigger, RLS
policies, grants, and Realtime publication entries.

## 3. Configure Auth

### 3a. Email/password
- **Authentication → Providers → Email**: ensure it's enabled.
- **Authentication → Settings**: turn **Confirm email** OFF if you want instant
  signup (matches current TickBell behavior). Turn it ON for stricter signup.

### 3b. Google OAuth
- **Authentication → Providers → Google**: enable.
- You need a Google OAuth Client ID + Secret. Get them from
  <https://console.cloud.google.com> → **APIs & Services → Credentials →
  Create OAuth Client ID → Web application**.
- Under **Authorized redirect URIs** paste the value Supabase shows in the
  Google provider page (looks like `https://<project-ref>.supabase.co/auth/v1/callback`).
- Paste **Client ID** and **Client Secret** into the Supabase Google provider
  form and save.
- Under **Authentication → URL Configuration** add your app's URL (both
  local `http://localhost:5173` and your production domain) to
  **Site URL** and **Redirect URLs**.

## 4. Environment variables

Copy `.env.example` to `.env` and fill in the two values from **Project
Settings → API** in Supabase:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```

The publishable/anon key is **safe to ship** in the frontend — RLS enforces
access. Never commit the `service_role` key.

## 5. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, sign up, and confirm everything works.

## 6. (Optional) Migrate existing data from Lovable Cloud

If you have real user/message data in Lovable Cloud that you want to keep:

1. In Lovable: **Cloud → Advanced settings → Export data**. You'll receive a
   dump of your tables (CSV or SQL, depending on what Lovable ships).
2. In your new Supabase project, use **Table Editor → Import data** (CSV) or
   the SQL editor for SQL dumps.
3. Import in this order to satisfy foreign keys:
   `auth.users` (via Supabase's user import) → `profiles` → `groups` →
   `group_members` → `messages` → `bells` → `bell_responses`.

**Note:** users must exist in `auth.users` before their `profiles` row can
be inserted. For a small user base, it's often easier to ask users to
sign up fresh on the new instance.

## 7. Deploy the frontend

Any static host works. Examples:

- **Vercel:** `vercel` in the repo root, set the two env vars in the dashboard.
- **Netlify:** connect the repo, build command `npm run build`, publish dir `dist`.
- **Cloudflare Pages:** same as Netlify.
- **GitHub Pages:** run `npm run build` and push `dist/` to the `gh-pages` branch.

Make sure your production URL is added to Supabase → **Auth → URL Configuration**.

## 8. That's it

The project no longer needs Lovable for anything. All code is in your GitHub
repo, all data is in your Supabase project. Continue development however you
prefer (locally, Cursor, VS Code, GitHub Codespaces, etc.).
