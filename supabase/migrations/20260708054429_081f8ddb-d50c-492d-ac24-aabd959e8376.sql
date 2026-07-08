
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_profile_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT messages_recipient_id_profile_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.bells
  ADD CONSTRAINT bells_sender_id_profile_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT bells_recipient_id_profile_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_user_id_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
