-- Users who signed up before the schema existed never ran handle_new_user().
-- Give them a profile, preferences and payment sources. Safe to run repeatedly.
insert into public.profiles (id, full_name)
  select id, raw_user_meta_data->>'full_name' from auth.users on conflict (id) do nothing;
insert into public.user_preferences (user_id)
  select id from auth.users on conflict (user_id) do nothing;
insert into public.payment_sources (user_id, code, display_name, android_package)
  select u.id, s.code, s.display_name, s.pkg from auth.users u cross join (values
    ('gpay', 'Google Pay', 'com.google.android.apps.nbu.paisa.user'),
    ('phonepe', 'PhonePe', 'com.phonepe.app'),
    ('paytm', 'Paytm', 'net.one97.paytm'),
    ('cred', 'CRED', 'com.dreamplug.androidapp'),
    ('bank', 'Bank apps / SMS', null),
    ('card', 'Credit / Debit card', null),
    ('cash', 'Cash', null)) as s(code, display_name, pkg)
  on conflict (user_id, code) do nothing;

-- Make the API pick up the new tables immediately.
notify pgrst, 'reload schema';
