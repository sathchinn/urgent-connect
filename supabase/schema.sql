-- ============================================================================
-- TickBell — Complete Database Schema
-- ----------------------------------------------------------------------------
-- Run this file ONCE against a fresh Supabase project (SQL editor or CLI).
-- It creates all tables, enums, functions, triggers, RLS policies, grants,
-- and Realtime configuration required by the TickBell app.
--
-- Requirements: PostgreSQL 15+, Supabase Auth enabled (auth.users exists).
-- ============================================================================

-- ---------- Extensions ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Enums -----------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.member_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bell_response_kind AS ENUM ('accept', 'busy', 'dismiss');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text NOT NULL,
  email          text,
  avatar_url     text,
  phone          text,
  status_message text DEFAULT 'Available',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone) WHERE phone IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- groups
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  avatar_url  text,
  created_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- group_members
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      public.member_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx  ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS group_members_group_idx ON public.group_members(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id     uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((group_id IS NOT NULL) OR (recipient_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS messages_group_idx     ON public.messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS messages_dm_idx        ON public.messages(sender_id, recipient_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- bells
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bells (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id     uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((group_id IS NOT NULL) OR (recipient_id IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bells TO authenticated;
GRANT ALL ON public.bells TO service_role;
ALTER TABLE public.bells ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- bell_responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bell_responses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bell_id    uuid NOT NULL REFERENCES public.bells(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response   public.bell_response_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bell_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bell_responses TO authenticated;
GRANT ALL ON public.bell_responses TO service_role;
ALTER TABLE public.bell_responses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper functions (SECURITY DEFINER; avoids recursive RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members
                  WHERE group_id = _group_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members
                  WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.shares_group_with(_other uuid, _viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members a
    JOIN public.group_members b ON a.group_id = b.group_id
    WHERE a.user_id = _viewer AND b.user_id = _other
  );
$$;

CREATE OR REPLACE FUNCTION public.has_dm_with(_other uuid, _viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages
    WHERE (sender_id = _viewer AND recipient_id = _other)
       OR (sender_id = _other  AND recipient_id = _viewer)
  );
$$;

CREATE OR REPLACE FUNCTION public.find_user_by_phone(_phone text)
RETURNS TABLE(id uuid, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.phone = _phone
    AND auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_group_with(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_dm_with(uuid, uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_user_by_phone(text)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_group_member(uuid, uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.shares_group_with(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_dm_with(uuid, uuid)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.find_user_by_phone(text)      TO authenticated;

-- ============================================================================
-- New-user trigger: auto-create a profile row when auth.users gets a row
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name',
             NEW.raw_user_meta_data->>'full_name',
             NEW.raw_user_meta_data->>'name',
             split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- RLS policies
-- ============================================================================

-- profiles
DROP POLICY IF EXISTS "Users can view own profile"                    ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of shared group members" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles of DM contacts"        ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"                  ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"                  ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can view profiles of shared group members" ON public.profiles
  FOR SELECT TO authenticated USING (public.shares_group_with(id, auth.uid()));
CREATE POLICY "Users can view profiles of DM contacts" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_dm_with(id, auth.uid()));
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- groups
DROP POLICY IF EXISTS "Members or creator can view groups" ON public.groups;
DROP POLICY IF EXISTS "Authenticated can create groups"    ON public.groups;
DROP POLICY IF EXISTS "Admins can update groups"           ON public.groups;
DROP POLICY IF EXISTS "Admins can delete groups"           ON public.groups;

CREATE POLICY "Members or creator can view groups" ON public.groups
  FOR SELECT USING (public.is_group_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "Authenticated can create groups" ON public.groups
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can update groups" ON public.groups
  FOR UPDATE TO authenticated USING (public.is_group_admin(id, auth.uid()));
CREATE POLICY "Admins can delete groups" ON public.groups
  FOR DELETE TO authenticated USING (public.is_group_admin(id, auth.uid()));

-- group_members
DROP POLICY IF EXISTS "Members can view group memberships"    ON public.group_members;
DROP POLICY IF EXISTS "Creator or admin can add members"      ON public.group_members;
DROP POLICY IF EXISTS "Admins can update members"             ON public.group_members;
DROP POLICY IF EXISTS "Admins can remove members"             ON public.group_members;

CREATE POLICY "Members can view group memberships" ON public.group_members
  FOR SELECT TO authenticated USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Creator or admin can add members" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_group_admin(group_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.groups g
               WHERE g.id = group_members.group_id AND g.created_by = auth.uid())
  );
CREATE POLICY "Admins can update members" ON public.group_members
  FOR UPDATE TO authenticated USING (public.is_group_admin(group_id, auth.uid()));
CREATE POLICY "Admins can remove members" ON public.group_members
  FOR DELETE TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()) OR user_id = auth.uid());

-- messages
DROP POLICY IF EXISTS "Read messages in own convos" ON public.messages;
DROP POLICY IF EXISTS "Send messages"               ON public.messages;
DROP POLICY IF EXISTS "Delete own messages"         ON public.messages;

CREATE POLICY "Read messages in own convos" ON public.messages
  FOR SELECT TO authenticated USING (
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
    OR (recipient_id IS NOT NULL AND (sender_id = auth.uid() OR recipient_id = auth.uid()))
  );
CREATE POLICY "Send messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND (
      (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
      OR (recipient_id IS NOT NULL)
    )
  );
CREATE POLICY "Delete own messages" ON public.messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

-- bells
DROP POLICY IF EXISTS "Read bells for member/recipient" ON public.bells;
DROP POLICY IF EXISTS "Send bell to group or user"      ON public.bells;

CREATE POLICY "Read bells for member/recipient" ON public.bells
  FOR SELECT TO authenticated USING (
    sender_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
    OR (recipient_id IS NOT NULL AND recipient_id = auth.uid())
  );
CREATE POLICY "Send bell to group or user" ON public.bells
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND (
      (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
      OR (recipient_id IS NOT NULL)
    )
  );

-- bell_responses
DROP POLICY IF EXISTS "Read bell responses if allowed to see bell" ON public.bell_responses;
DROP POLICY IF EXISTS "Respond to bell"                            ON public.bell_responses;
DROP POLICY IF EXISTS "Update own bell response"                   ON public.bell_responses;

CREATE POLICY "Read bell responses if allowed to see bell" ON public.bell_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.bells b
      WHERE b.id = bell_responses.bell_id
        AND (b.sender_id = auth.uid()
             OR (b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid()))
             OR (b.recipient_id IS NOT NULL AND b.recipient_id = auth.uid()))
    )
  );
CREATE POLICY "Respond to bell" ON public.bell_responses
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.bells b
      WHERE b.id = bell_responses.bell_id
        AND ((b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid()))
             OR (b.recipient_id IS NOT NULL AND b.recipient_id = auth.uid()))
    )
  );
CREATE POLICY "Update own bell response" ON public.bell_responses
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Realtime — add tables to the supabase_realtime publication
-- ============================================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bells;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bell_responses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage: TickBell does not use Supabase Storage. No buckets or storage
-- policies are required. If you later add avatar uploads or attachments,
-- create a bucket via the Supabase dashboard and add policies here.
