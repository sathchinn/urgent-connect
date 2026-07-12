# TickBell

**When Every Second Matters.** Real-time priority communication: ring an
individual or an entire group with a loud, attention-grabbing bell,
plus 1:1 and group chat.

## Stack

- **Frontend:** React 19 + TanStack Start (SSR) + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Realtime)
- **PWA:** installable on iOS/Android home screen

## Features

- Email/password + Google sign-in
- User profiles with phone-based contact lookup
- Groups with admin/member roles (admin-only add/remove)
- 1:1 and group chat with realtime delivery
- Bell alerts with full-screen incoming overlay, loud sound, and vibration
- Browser notifications + sound chime for background messages
- Dark mode

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in your Supabase values
cp .env.example .env

# 3. Run the dev server
npm run dev
```

Open <http://localhost:5173>.

## Environment variables

Only two are required at runtime:

| Var                             | Where to find it                          |
| ------------------------------- | ----------------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase → Project Settings → API → URL   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API → anon  |

The anon/publishable key is safe to ship in the frontend — Row Level Security
enforces access on the database side.

## Setting up the backend

See **[MIGRATION.md](./MIGRATION.md)** for step-by-step instructions to
create a Supabase project and run the schema. The full SQL lives in
[`supabase/schema.sql`](./supabase/schema.sql) — run it once in the Supabase
SQL editor and you're done.

## Build & deploy

```bash
npm run build      # produces .output/ (server) and dist/ (client)
npm run start      # run the built server locally
```

The project uses TanStack Start (SSR). It builds to a Node/Edge server
bundle plus static assets. Any host that runs Node 20+ works:

- **Vercel:** zero config, uses the `.output/` directory.
- **Netlify:** connect the repo, framework auto-detected.
- **Cloudflare Pages / Workers:** deploy the `.output/` bundle.
- **Any Node host:** `node .output/server/index.mjs`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the host's
environment settings.

## Project structure

```
src/
  routes/                # File-based routes (TanStack Router)
    __root.tsx           # Root layout, <head>, providers
    index.tsx            # Landing redirect
    auth.tsx             # Sign in / sign up
    _authenticated/      # Auth-gated subtree
      route.tsx          # Session gate
      home.tsx           # Bell / Chats / Contacts tabs
      chat.$id.tsx       # 1:1 and group chat
      group.$id.tsx      # Group management
      profile.tsx        # Profile & settings
  components/            # UI + feature components
  integrations/supabase/ # Supabase clients (auto-generated types)
  lib/                   # Shared utilities (audio, notifications)
  styles.css             # Tailwind + theme tokens
public/
  manifest.webmanifest   # PWA manifest
  icon-*.png             # App icons
supabase/
  schema.sql             # Complete DB schema — run once on a fresh project
```

## PWA install

1. Open the deployed site on your phone in Chrome (Android) or Safari (iOS).
2. **Add to Home Screen** / **Install app**.
3. Launches full-screen with the TickBell icon.

## License

MIT — do what you like. No attribution required.
