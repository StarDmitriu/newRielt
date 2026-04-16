-- Portable PostgreSQL import script extracted from a Supabase cluster dump.
-- This version intentionally removes Supabase-managed roles, schemas, RLS,
-- storage/realtime/auth internals, and extension-specific ACLs.
--
-- What is preserved here:
-- 1. public.users
-- 2. public.otp_codes
-- 3. data from those tables
--
-- Important:
-- The application code in this repository also uses additional tables such as
-- campaigns, campaign_jobs, lead_requests, message_templates, payments,
-- referrals, subscriptions, telegram_groups, template_group_targets,
-- whatsapp_groups. They are not present in the dump fragment provided by the
-- user, so they are not recreated by this file.

BEGIN;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE IF NOT EXISTS public.otp_codes (
    phone text PRIMARY KEY,
    code text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login timestamptz,
    is_verified boolean NOT NULL DEFAULT false,
    full_name text,
    gender text,
    telegram text,
    birthday date
);

INSERT INTO public.otp_codes (phone, code, created_at) VALUES
('375297810385', '858751', '2025-11-25 18:22:31.93339+00'),
('375447472104', '663569', '2025-11-24 21:43:43.151885+00'),
('8769767877899', '627303', '2025-12-07 11:44:45.407857+00')
ON CONFLICT (phone) DO UPDATE
SET code = EXCLUDED.code,
    created_at = EXCLUDED.created_at;

INSERT INTO public.users (
    id,
    phone,
    created_at,
    last_login,
    is_verified,
    full_name,
    gender,
    telegram,
    birthday
) VALUES
('81ed2731-8588-42fb-8350-74a62de0a324', '234234234', '2025-11-25 19:59:42.652972+00', NULL, true, NULL, NULL, NULL, NULL),
('b1110447-8084-4e38-ac61-2814aed5c8ea', '23423424', '2025-11-25 20:01:42.148709+00', NULL, true, NULL, NULL, NULL, NULL),
('b0c28a1b-48a6-42d8-988c-5c96e9ef1844', '9999999', '2025-11-25 20:33:09.796261+00', NULL, true, NULL, NULL, NULL, NULL),
('4d8010f4-ce02-4fd7-88ba-522390f77459', '344311124124124124414', '2025-12-01 20:10:21.129748+00', NULL, true, NULL, NULL, NULL, NULL),
('93ebb2f6-434f-4c0e-ba70-94edf0102d8f', '1234567890', '2025-12-01 20:11:29.042374+00', NULL, true, 'AL', 'm', '@AL', '2000-03-21'),
('a572b966-7586-4278-b1b1-04ffc7db5110', '0234319439843905', '2025-12-01 20:35:31.989429+00', NULL, true, 'Tim', 'm', '@timmm', '2009-12-04'),
('cd047a15-6b03-4692-a684-461d1d497c79', '12312312312321312', '2025-12-07 11:48:25.138099+00', NULL, true, 'wefww', 'm', '@wefwefw', '2000-01-01'),
('0984c96c-e351-41a8-ae8e-1c29ae6971f6', '242423', '2025-12-01 20:09:37.347002+00', '2025-12-07 12:15:44.985+00', true, NULL, NULL, NULL, NULL),
('35fe6a84-9e64-4c17-bc10-c65dca98d892', '283423', '2025-11-25 19:50:10.080747+00', '2025-12-07 12:35:42.768+00', true, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO UPDATE
SET phone = EXCLUDED.phone,
    created_at = EXCLUDED.created_at,
    last_login = EXCLUDED.last_login,
    is_verified = EXCLUDED.is_verified,
    full_name = EXCLUDED.full_name,
    gender = EXCLUDED.gender,
    telegram = EXCLUDED.telegram,
    birthday = EXCLUDED.birthday;

COMMIT;
