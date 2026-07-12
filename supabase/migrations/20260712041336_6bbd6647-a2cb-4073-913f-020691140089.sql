GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_group_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_dm_with(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_phone(text) TO authenticated;