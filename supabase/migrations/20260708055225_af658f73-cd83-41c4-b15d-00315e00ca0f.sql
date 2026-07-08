DROP POLICY IF EXISTS "Members can view groups" ON public.groups;
CREATE POLICY "Members or creator can view groups" ON public.groups
FOR SELECT USING (public.is_group_member(id, auth.uid()) OR created_by = auth.uid());