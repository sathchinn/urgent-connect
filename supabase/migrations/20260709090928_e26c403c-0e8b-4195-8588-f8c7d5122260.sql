
-- 1) Tighten profiles SELECT: only self, or users sharing a group / DM
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

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

REVOKE EXECUTE ON FUNCTION public.shares_group_with(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_dm_with(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can view profiles of shared group members"
ON public.profiles FOR SELECT TO authenticated
USING (public.shares_group_with(id, auth.uid()));

CREATE POLICY "Users can view profiles of DM contacts"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_dm_with(id, auth.uid()));

-- 2) Safe phone lookup RPC (returns minimal fields; no email)
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

REVOKE EXECUTE ON FUNCTION public.find_user_by_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_user_by_phone(text) TO authenticated;

-- 3) Lock down SECURITY DEFINER helper functions from direct client execution
REVOKE EXECUTE ON FUNCTION public.is_group_admin(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
