begin;
-- Expand only the preference constraint: existing values, default, grants and RLS stay intact.
alter table public.profiles drop constraint profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check
  check (theme in ('light', 'dark', 'pink', 'light-blue', 'light-green', 'light-pink'));
notify pgrst, 'reload schema';
commit;
