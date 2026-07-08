ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles(phone) WHERE phone IS NOT NULL;