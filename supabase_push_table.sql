-- Create table for storing Admin Push Subscriptions
CREATE TABLE IF NOT EXISTS public.admin_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE NOT NULL,
    keys JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.admin_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read to admin_subscriptions" ON public.admin_subscriptions;
DROP POLICY IF EXISTS "Allow public insert to admin_subscriptions" ON public.admin_subscriptions;
DROP POLICY IF EXISTS "Allow public update to admin_subscriptions" ON public.admin_subscriptions;
DROP POLICY IF EXISTS "Allow public delete to admin_subscriptions" ON public.admin_subscriptions;

-- Create Policies
CREATE POLICY "Allow public read to admin_subscriptions" ON public.admin_subscriptions FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert to admin_subscriptions" ON public.admin_subscriptions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update to admin_subscriptions" ON public.admin_subscriptions FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete to admin_subscriptions" ON public.admin_subscriptions FOR DELETE TO public USING (true);
