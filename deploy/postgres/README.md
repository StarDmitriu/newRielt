# PostgreSQL Migration Notes

Файл [supabase_to_postgres_core.sql](D:\borislavRieltor\rieltor-master\rieltor-master\deploy\postgres\supabase_to_postgres_core.sql) содержит очищенную версию части Supabase-дампа, которую можно выполнить на обычном PostgreSQL без Supabase.

Что включено:

- `public.users`
- `public.otp_codes`
- данные из этих таблиц
- `pgcrypto` для `gen_random_uuid()`

Что исключено:

- роли Supabase (`anon`, `authenticated`, `service_role`, `supabase_*`)
- схемы `auth`, `realtime`, `storage`, `vault`, `graphql`
- Supabase-specific extensions, event triggers, RLS/ACL из managed-окружения

Почему этого недостаточно для полного переезда:

По коду backend приложение использует ещё такие таблицы:

- `campaigns`
- `campaign_jobs`
- `lead_requests`
- `message_templates`
- `payments`
- `referrals`
- `subscriptions`
- `telegram_groups`
- `template_group_targets`
- `whatsapp_groups`

Этих таблиц нет в присланном фрагменте дампа. Значит для полного переноса нужны:

1. полный SQL-дамп `public`-схемы Supabase;
2. либо экспорт схемы/данных именно этих прикладных таблиц.

Пример импорта на сервер:

```bash
psql -h HOST -U USER -d DBNAME -f deploy/postgres/supabase_to_postgres_core.sql
```

Если нужен полный перенос проекта с отказом от Supabase, следующим шагом надо:

1. получить полный список таблиц и их DDL из Supabase;
2. собрать единый `schema.sql` для обычного PostgreSQL;
3. заменить в backend `@supabase/supabase-js` на прямой доступ к PostgreSQL через ORM или драйвер.
