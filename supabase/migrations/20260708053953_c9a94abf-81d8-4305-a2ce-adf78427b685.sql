
REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;
