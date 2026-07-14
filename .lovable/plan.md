
# TickBell Enhancements Plan

I'll implement your requests in logical groups. A few items need decisions before I start — see **Questions** at the end.

## 1. Rename "Chat" → "Groups" (UI only)
- Update Home tab label + icon copy in `src/routes/_authenticated/home.tsx`.
- Update page titles, button labels ("Open chat" stays inside a group; the tab is renamed).
- No routing, table, or feature changes.

## 2. Group Admin role enforcement
Backend policies already restrict admin actions, but the UI currently shows "Delete group" / "Leave group" to everyone. I'll:
- Hide Edit, Add member, Remove member, Delete group from non-admins in `group.$id.tsx`.
- Non-admins see only: group name, description, member count, member list, "Leave group".
- Keep server-side RLS as source of truth.

## 3. Fix "0 members" display
Current bug: the members query joins `profiles!group_members_user_id_profile_fkey`. With the tightened profile RLS from the earlier security fix, non-admin members can't read peer profile rows, so the join returns 0 rows.
Fix: add a `public.get_group_members(_group_id)` SECURITY DEFINER function returning `{user_id, role, display_name, avatar_url, nickname}` for members who share the group. Frontend calls it via `supabase.rpc`.

## 4. Add / Remove members — instant refresh
Already wired via `queryClient.invalidateQueries`. I'll also subscribe to `group_members` realtime INSERT/DELETE for this group so all admins see live updates without manual refresh.

## 5. Group deletion — admin only
Same as #2 — hide "Delete group" from non-admins; RLS already enforces it.

## 6. Nicknames (group-scoped preferred names)
New column `group_members.nickname text` (nullable).
- Group creation form: rename input label "Name" → "Nickname (Preferred Name)" — **assumption**: this refers to the *creator's own* nickname within the group. The group's actual **name** stays as-is (it's needed to identify the group). See Question 1.
- In Group Info, each member row gets a small "Edit nickname" pencil (admin only) to set per-group display name.
- Message list + Group Info show `nickname || display_name`.

## 7. Bell response status → sender realtime toast
- Sender subscribes to `bell_responses` inserts where `bell_id IN (my recent bells)`.
- On event: toast + inline row update: "Lakshmi accepted your bell" / "rejected" / "is currently busy".
- Add "Reject" option to `IncomingBell` (currently only Accept/Busy/Dismiss). Extend `bell_responses.response` enum values to include `reject`.

## 8. Bell abuse protection (with warning UX)
Adopting your improvement: warn on the 3rd, block on the 4th within 2 min to the same recipient.
- New table `bell_blocks(user_id, blocked_until, reason, created_at)`.
- New RPC `send_bell(recipient_id, group_id)`:
  - Checks `bell_blocks` — if active, returns error message you specified.
  - Counts sender's bells to same recipient in last 2 min:
    - `= 2` → returns `{warning: true}` (client shows the warning toast).
    - `>= 3` → inserts 3h block, returns error.
  - Otherwise inserts the bell.
- Client swaps direct `bells` insert for this RPC and handles `warning` / `blocked` responses.

## 9. Admin section: Blocked Users
- New `app_role` enum + `user_roles` table (per security best-practice).
- `has_role(uid, 'admin')` SECURITY DEFINER function.
- New route `/_authenticated/admin/blocks.tsx` visible only to app admins (link shown in Contacts tab for admins).
- Lists blocked users with time / remaining / reason. "Unblock" button clears the row.
- Automatic unblock: rows past `blocked_until` are ignored (no cron needed); a cleanup can happen on read.
- **Assumption**: you'll manually promote yourself to admin via a one-time insert I'll run. See Question 2.

## 10. Background push notifications (PWA)
This is the biggest lift. Web Push on Android/iOS PWAs requires:
- A Service Worker registered with `showNotification` handler.
- Web-Push VAPID keys (public + private).
- A subscription table + server function to send pushes on new bells/messages/responses (called from DB triggers via `pg_net` → server route).
- iOS 16.4+: only works after user installs the PWA to Home Screen and grants notification permission.

I'll implement:
- `public/sw.js` (messaging worker — kept separate from any future app-shell SW).
- `src/lib/push.ts` client-side subscribe flow (asks permission, POSTs `PushSubscription` to server).
- `push_subscriptions` table.
- Server route `/api/public/hooks/dispatch-push` triggered by DB webhooks on `bells` and `messages` inserts.
- Requires VAPID keys stored as secrets — I'll generate them and add via secrets tool.

Caveat: iOS home-screen PWA push has known limitations (no delivery when device is in Low Power Mode or PWA hasn't been opened in ~7 days). This is an Apple restriction, not something I can work around.

---

## Questions before I start

1. **Group creation "Nickname" field**: When creating a group, should the "Nickname" field replace the *group name* (so the group itself is called by a preferred label) — OR is it the creator's own nickname within the group, with a separate Group Name field still required? Your example ("Lakshmi – HR", "Lakshmi – Accounts") describes per-member nicknames, which suggests the latter. I'll assume the latter unless you say otherwise.

2. **App admin bootstrap**: To test the Blocked Users admin panel, I need to make your account an admin. Confirm the email you sign in with and I'll grant it after the migration lands.

3. **Push notifications sender**: Web Push (VAPID) is free and works without external services. Confirm you want me to go with self-hosted Web Push (my recommendation) vs. Firebase Cloud Messaging (requires you to create an FCM project and paste credentials).

If you're good with the assumptions above (nickname = per-member, self-hosted Web Push, admin promotion via your email), reply "go" and I'll implement everything in one pass.
