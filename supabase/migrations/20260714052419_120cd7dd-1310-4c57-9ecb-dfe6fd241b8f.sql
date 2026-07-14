
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS nickname text;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own roles" ON public.user_roles;
CREATE POLICY "Users can see their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Admins can see all roles" ON public.user_roles;
CREATE POLICY "Admins can see all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.bell_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_until timestamptz NOT NULL,
  reason text NOT NULL DEFAULT 'Exceeded Bell attempts',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bell_blocks_active_idx ON public.bell_blocks (user_id, blocked_until);
GRANT SELECT ON public.bell_blocks TO authenticated;
GRANT ALL ON public.bell_blocks TO service_role;
ALTER TABLE public.bell_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their own blocks" ON public.bell_blocks;
CREATE POLICY "Users see their own blocks" ON public.bell_blocks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins see all blocks" ON public.bell_blocks;
CREATE POLICY "Admins see all blocks" ON public.bell_blocks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage blocks" ON public.bell_blocks;
CREATE POLICY "Admins manage blocks" ON public.bell_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_group_members(_group_id uuid)
RETURNS TABLE(
  member_row_id uuid,
  user_id uuid,
  role text,
  nickname text,
  display_name text,
  avatar_url text,
  status_message text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gm.id, gm.user_id, gm.role, gm.nickname,
         p.display_name, p.avatar_url, p.status_message
  FROM public.group_members gm
  LEFT JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.group_id = _group_id
    AND public.is_group_member(_group_id, auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.get_group_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_bell(_recipient_id uuid, _group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sender uuid := auth.uid();
  _recent_count int;
  _active_block timestamptz;
  _bell_id uuid;
BEGIN
  IF _sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF (_recipient_id IS NULL) = (_group_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Provide exactly one of recipient or group');
  END IF;

  SELECT blocked_until INTO _active_block
  FROM public.bell_blocks
  WHERE user_id = _sender AND blocked_until > now()
  ORDER BY blocked_until DESC LIMIT 1;
  IF _active_block IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'blocked', true, 'blocked_until', _active_block,
      'error', 'You have exceeded the maximum Bell attempts. Bell functionality has been temporarily disabled for 3 hours. Please try again later.'
    );
  END IF;

  IF _recipient_id IS NOT NULL THEN
    SELECT count(*) INTO _recent_count
    FROM public.bells
    WHERE sender_id = _sender
      AND recipient_id = _recipient_id
      AND created_at > now() - interval '2 minutes';

    IF _recent_count >= 3 THEN
      INSERT INTO public.bell_blocks (user_id, blocked_until, reason)
      VALUES (_sender, now() + interval '3 hours', 'Exceeded Bell attempts');
      RETURN jsonb_build_object(
        'ok', false, 'blocked', true,
        'error', 'You have exceeded the maximum Bell attempts. Bell functionality has been temporarily disabled for 3 hours. Please try again later.'
      );
    END IF;
  END IF;

  INSERT INTO public.bells (sender_id, recipient_id, group_id)
  VALUES (_sender, _recipient_id, _group_id)
  RETURNING id INTO _bell_id;

  RETURN jsonb_build_object(
    'ok', true,
    'bell_id', _bell_id,
    'warning', COALESCE(_recent_count, 0) = 2
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_bell(uuid, uuid) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bell_blocks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bell_responses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
