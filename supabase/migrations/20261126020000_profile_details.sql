-- Richer profile + profile photos. Safe to run more than once.

alter table public.profiles
  add column if not exists phone         text check (phone is null or phone ~ '^\+?[0-9 ]{7,16}$'),
  add column if not exists date_of_birth date check (date_of_birth is null or (date_of_birth > '1900-01-01' and date_of_birth <= current_date)),
  add column if not exists city          text check (city is null or char_length(city) <= 80),
  add column if not exists occupation    text check (occupation is null or char_length(occupation) <= 80);

-- New users: take name and photo from the sign-in provider (Google sends name / avatar_url / picture).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.payment_sources (user_id, code, display_name, android_package) values
    (new.id, 'gpay',    'Google Pay', 'com.google.android.apps.nbu.paisa.user'),
    (new.id, 'phonepe', 'PhonePe',    'com.phonepe.app'),
    (new.id, 'paytm',   'Paytm',      'net.one97.paytm'),
    (new.id, 'cred',    'CRED',       'com.dreamplug.androidapp'),
    (new.id, 'bank',    'Bank apps / SMS', null),
    (new.id, 'card',    'Credit / Debit card', null),
    (new.id, 'cash',    'Cash', null)
  on conflict (user_id, code) do nothing;
  return new;
end $$;

-- Existing users: fill in a missing name / photo from their sign-in provider.
update public.profiles p set
  full_name  = coalesce(p.full_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u where u.id = p.id;

-- Profile photos: public-read bucket, 2 MB images only; each user may only
-- write inside their own folder (avatars/<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar upload own folder" on storage.objects;
drop policy if exists "avatar update own folder" on storage.objects;
drop policy if exists "avatar delete own folder" on storage.objects;
create policy "avatar upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
