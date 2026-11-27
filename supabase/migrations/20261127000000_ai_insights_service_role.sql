-- The generate-insights function saves summaries with the service role.
-- Newer Supabase projects don't grant table access to service_role automatically,
-- so give it access to ai_insights only. (service_role bypasses RLS; the function
-- always sets user_id from the caller's verified JWT.)
grant select, insert, update, delete on public.ai_insights to service_role;
