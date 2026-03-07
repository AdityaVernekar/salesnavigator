create or replace function is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.company_id = target_company_id
      and cu.user_id = auth.uid()
  );
$$;

drop policy if exists "company_users_select_self_or_company_admin" on company_users;
drop policy if exists "company_users_manage_company_admin" on company_users;

create policy "company_users_select_self" on company_users
for select using (user_id = auth.uid());
