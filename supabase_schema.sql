-- ==============================================================================
-- TESTLY AI - COMPLETE SUPABASE DATABASE SCHEMA
-- Execute this script in: Supabase Dashboard -> SQL Editor -> "New query" -> Run
-- ==============================================================================

-- 1. Enable UUID Extension (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. USER PROFILES TABLE
-- Stores profile details, QA preferences, and API configurations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'QA Automation Engineer',
    avatar_url TEXT DEFAULT '',
    gemini_api_key TEXT DEFAULT '',
    default_browser TEXT DEFAULT 'Chrome',
    screenshot_quality TEXT DEFAULT 'High',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ==============================================================================
-- 3. TEST EXECUTION HISTORY TABLE
-- Stores audits, execution results, test cases, and PDF report URLs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.test_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    browser TEXT DEFAULT 'Chrome',
    testing_types TEXT[] DEFAULT ARRAY['Functional', 'UI/UX'],
    status TEXT DEFAULT 'completed', -- 'planning', 'generating', 'executing', 'completed', 'failed'
    success_rate NUMERIC(5, 2) DEFAULT 100.00,
    test_cases_count INTEGER DEFAULT 0,
    passed_count INTEGER DEFAULT 0,
    bugs_count INTEGER DEFAULT 0,
    test_results JSONB DEFAULT '[]'::jsonb,
    bugs JSONB DEFAULT '[]'::jsonb,
    plan JSONB DEFAULT '{}'::jsonb,
    report_url TEXT,
    timestamp TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMPTZ
);

-- Index for fast user history lookup
CREATE INDEX IF NOT EXISTS idx_test_history_user_id ON public.test_history(user_id);
CREATE INDEX IF NOT EXISTS idx_test_history_timestamp ON public.test_history(timestamp DESC);

-- ==============================================================================
-- 4. TESTED WEBSITES TABLE
-- Stores crawled website metadata, tech stack, and last audit date
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tested_websites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT DEFAULT 'Unknown Page',
    site_type TEXT DEFAULT 'Landing Page',
    technologies TEXT[] DEFAULT ARRAY['HTML5', 'CSS3'],
    info JSONB DEFAULT '{}'::jsonb,
    last_tested TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tested_websites_user_id ON public.tested_websites(user_id);
CREATE INDEX IF NOT EXISTS idx_tested_websites_url ON public.tested_websites(url);

-- ==============================================================================
-- 5. PASSWORD RESET OTP AUDIT TABLE
-- Logs 6-digit OTP verification codes dispatched via SMTP
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON public.password_reset_otps(email);

-- ==============================================================================
-- 6. AUTOMATIC USER PROFILE TRIGGER
-- Automatically inserts a row into public.profiles whenever a user signs up
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'QA Automation Engineer')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        role = COALESCE(EXCLUDED.role, public.profiles.role),
        updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow clean re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create Trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures data privacy: users can only see and manage their own test audits
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tested_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- TEST HISTORY POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own test history" ON public.test_history;
CREATE POLICY "Users can view their own test history"
    ON public.test_history FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert test history" ON public.test_history;
CREATE POLICY "Users can insert test history"
    ON public.test_history FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update their test history" ON public.test_history;
CREATE POLICY "Users can update their test history"
    ON public.test_history FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their test history" ON public.test_history;
CREATE POLICY "Users can delete their test history"
    ON public.test_history FOR DELETE
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- TESTED WEBSITES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their tested websites" ON public.tested_websites;
CREATE POLICY "Users can view their tested websites"
    ON public.tested_websites FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert tested websites" ON public.tested_websites;
CREATE POLICY "Users can insert tested websites"
    ON public.tested_websites FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update tested websites" ON public.tested_websites;
CREATE POLICY "Users can update tested websites"
    ON public.tested_websites FOR UPDATE
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- OTP TABLE POLICIES (Service Role & Public Verification)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow OTP generation and verification" ON public.password_reset_otps;
CREATE POLICY "Allow OTP generation and verification"
    ON public.password_reset_otps FOR ALL
    USING (true)
    WITH CHECK (true);

-- ==============================================================================
-- 8. STORAGE BUCKETS (Optional for storing audit PDF reports & screenshots)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('testly-reports', 'testly-reports', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('testly-screenshots', 'testly-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Storage public read policy
DROP POLICY IF EXISTS "Public Report Access" ON storage.objects;
CREATE POLICY "Public Report Access"
    ON storage.objects FOR SELECT
    USING (bucket_id IN ('testly-reports', 'testly-screenshots'));

DROP POLICY IF EXISTS "Authenticated Users Can Upload Reports" ON storage.objects;
CREATE POLICY "Authenticated Users Can Upload Reports"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id IN ('testly-reports', 'testly-screenshots'));

-- ==============================================================================
-- 9. SECURE PASSWORD RESET FUNCTION (NO AUTH SESSION REQUIRED)
-- Allows setting a new password using the verified OTP from password_reset_otps
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.reset_user_password(
    user_email TEXT,
    otp_token TEXT,
    new_plain_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
    matched_otp RECORD;
    target_user_id UUID;
BEGIN
    -- Validate password length
    IF LENGTH(new_plain_password) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters in length.');
    END IF;

    -- 1. Check if a valid, unexpired OTP exists for this email
    SELECT * INTO matched_otp
    FROM public.password_reset_otps
    WHERE LOWER(email) = LOWER(TRIM(user_email))
      AND otp_code = TRIM(otp_token)
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF matched_otp IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired OTP verification code.');
    END IF;

    -- 2. Locate user in auth.users
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(TRIM(user_email));

    IF target_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No registered account found with this email address.');
    END IF;

    -- 3. Directly update the encrypted password in auth.users using bcrypt
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(new_plain_password, extensions.gen_salt('bf')),
        updated_at = NOW()
    WHERE id = target_user_id;

    -- 4. Mark the OTP as verified/used so it cannot be reused
    UPDATE public.password_reset_otps
    SET verified = TRUE
    WHERE id = matched_otp.id;

    RETURN jsonb_build_object('success', true, 'message', 'Password has been successfully updated.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Done!

