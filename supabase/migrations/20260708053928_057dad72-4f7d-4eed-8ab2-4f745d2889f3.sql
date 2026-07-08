
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  status_message TEXT DEFAULT 'Available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Groups
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Group members
CREATE TYPE public.member_role AS ENUM ('admin', 'member');
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id);
$$;
CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin');
$$;

-- Groups policies
CREATE POLICY "Members can view groups" ON public.groups FOR SELECT TO authenticated USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "Authenticated can create groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can update groups" ON public.groups FOR UPDATE TO authenticated USING (public.is_group_admin(id, auth.uid()));
CREATE POLICY "Admins can delete groups" ON public.groups FOR DELETE TO authenticated USING (public.is_group_admin(id, auth.uid()));

-- Group members policies
CREATE POLICY "Members can view group memberships" ON public.group_members FOR SELECT TO authenticated USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Creator or admin can add members" ON public.group_members FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id OR public.is_group_admin(group_id, auth.uid()) OR
  EXISTS(SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid())
);
CREATE POLICY "Admins can remove members" ON public.group_members FOR DELETE TO authenticated USING (
  public.is_group_admin(group_id, auth.uid()) OR user_id = auth.uid()
);
CREATE POLICY "Admins can update members" ON public.group_members FOR UPDATE TO authenticated USING (public.is_group_admin(group_id, auth.uid()));

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((group_id IS NULL) <> (recipient_id IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read messages in own convos" ON public.messages FOR SELECT TO authenticated USING (
  (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid())) OR
  (recipient_id IS NOT NULL AND (sender_id = auth.uid() OR recipient_id = auth.uid()))
);
CREATE POLICY "Send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND (
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid())) OR
    (recipient_id IS NOT NULL)
  )
);
CREATE POLICY "Delete own messages" ON public.messages FOR DELETE TO authenticated USING (sender_id = auth.uid());

-- Bells
CREATE TABLE public.bells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((group_id IS NULL) <> (recipient_id IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bells TO authenticated;
GRANT ALL ON public.bells TO service_role;
ALTER TABLE public.bells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read bells for member/recipient" ON public.bells FOR SELECT TO authenticated USING (
  sender_id = auth.uid() OR
  (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid())) OR
  (recipient_id IS NOT NULL AND recipient_id = auth.uid())
);
CREATE POLICY "Send bell to group or user" ON public.bells FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND (
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid())) OR
    (recipient_id IS NOT NULL)
  )
);

-- Bell responses
CREATE TYPE public.bell_response_type AS ENUM ('accept', 'busy', 'dismiss');
CREATE TABLE public.bell_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bell_id UUID NOT NULL REFERENCES public.bells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response public.bell_response_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(bell_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bell_responses TO authenticated;
GRANT ALL ON public.bell_responses TO service_role;
ALTER TABLE public.bell_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read bell responses if allowed to see bell" ON public.bell_responses FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.bells b WHERE b.id = bell_id AND (
    b.sender_id = auth.uid() OR
    (b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid())) OR
    (b.recipient_id IS NOT NULL AND b.recipient_id = auth.uid())
  ))
);
CREATE POLICY "Respond to bell" ON public.bell_responses FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND
  EXISTS(SELECT 1 FROM public.bells b WHERE b.id = bell_id AND (
    (b.group_id IS NOT NULL AND public.is_group_member(b.group_id, auth.uid())) OR
    (b.recipient_id IS NOT NULL AND b.recipient_id = auth.uid())
  ))
);
CREATE POLICY "Update own bell response" ON public.bell_responses FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bells;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bell_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;

-- Indexes
CREATE INDEX idx_messages_group ON public.messages(group_id, created_at DESC);
CREATE INDEX idx_messages_dm ON public.messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_bells_group ON public.bells(group_id, created_at DESC);
CREATE INDEX idx_bells_recipient ON public.bells(recipient_id, created_at DESC);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
