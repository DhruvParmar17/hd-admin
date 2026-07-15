-- Create extension for UUID generation if it doesn't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop old tables to prevent column mismatch and stale schema errors
DROP TABLE IF EXISTS public.enquiry_items CASCADE;
DROP TABLE IF EXISTS public.enquiries CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.dealers CASCADE;

-- 1. Create Dealers Table
CREATE TABLE IF NOT EXISTS public.dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    gstin VARCHAR(15),
    shop_address TEXT,
    device_registered BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    grade VARCHAR(100) NOT NULL, -- 'Commercial Plywood' or 'Laminate'
    wood_type VARCHAR(100) NOT NULL, -- e.g., 'Hardwood Core' or 'Off White'
    thickness_options TEXT[] NOT NULL, -- e.g., ['6mm', '9mm', '12mm', '16mm', '19mm'] or ['Laminate']
    size_options TEXT[] NOT NULL, -- e.g., ['8x4', '8x3', '7x4', '7x3', '6x4', '6x3', '5x4', '5x3'] or ['8x4']
    image_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Enquiries Table (linked to dealers)
CREATE TABLE IF NOT EXISTS public.enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_phone VARCHAR(50) REFERENCES public.dealers(phone_number) ON DELETE RESTRICT,
    dealer_name VARCHAR(255) NOT NULL,
    delivery_location VARCHAR(255) NOT NULL,
    comments TEXT,
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Contacted', 'Completed', 'Cancelled'
    billed_amount INTEGER DEFAULT NULL,
    payment_status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Enquiry Items Table
CREATE TABLE IF NOT EXISTS public.enquiry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    thickness VARCHAR(20) NOT NULL,
    size VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quality VARCHAR(50) DEFAULT NULL,
    rate INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_items ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for Anon/Public Access
-- Read/Write access to dealers for registrations
DROP POLICY IF EXISTS "Allow public read to dealers" ON public.dealers;
CREATE POLICY "Allow public read to dealers" ON public.dealers FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow public insert to dealers" ON public.dealers;
CREATE POLICY "Allow public insert to dealers" ON public.dealers FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update to dealers" ON public.dealers;
CREATE POLICY "Allow public update to dealers" ON public.dealers FOR UPDATE TO public USING (true);

-- Read access to products for anyone
DROP POLICY IF EXISTS "Allow public read to products" ON public.products;
CREATE POLICY "Allow public read to products" ON public.products FOR SELECT TO public USING (true);

-- Read/Write access to enquiries for anyone
DROP POLICY IF EXISTS "Allow public read to enquiries" ON public.enquiries;
CREATE POLICY "Allow public read to enquiries" ON public.enquiries FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow public insert to enquiries" ON public.enquiries;
CREATE POLICY "Allow public insert to enquiries" ON public.enquiries FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update to enquiries" ON public.enquiries;
CREATE POLICY "Allow public update to enquiries" ON public.enquiries FOR UPDATE TO public USING (true);

DROP POLICY IF EXISTS "Allow public delete to enquiries" ON public.enquiries;
CREATE POLICY "Allow public delete to enquiries" ON public.enquiries FOR DELETE TO public USING (true);

-- Read/Write access to enquiry items for anyone
DROP POLICY IF EXISTS "Allow public read to enquiry_items" ON public.enquiry_items;
CREATE POLICY "Allow public read to enquiry_items" ON public.enquiry_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow public insert to enquiry_items" ON public.enquiry_items;
CREATE POLICY "Allow public insert to enquiry_items" ON public.enquiry_items FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update to enquiry_items" ON public.enquiry_items;
CREATE POLICY "Allow public update to enquiry_items" ON public.enquiry_items FOR UPDATE TO public USING (true);

-- 6. Seed Simplified Catalog (Commercial Plywood and Laminate ONLY)
-- First, clear old products
TRUNCATE public.products CASCADE;

INSERT INTO public.products (name, description, grade, wood_type, thickness_options, size_options, image_url)
VALUES 
    (
        'Commercial Plywood', 
        'High density commercial grade plywood with premium quality hardwood core. Termite resistant.', 
        'Commercial Plywood', 
        'Hardwood Core', 
        ARRAY['6mm', '9mm', '12mm', '16mm', '19mm'],
        ARRAY['8x4', '8x3', '7x4', '7x3', '6x4', '6x3', '5x4', '5x3'],
        '/wood_mr.png'
    ),
    (
        'Laminate', 
        'Sleek off-white decorative laminate sheets. High scratch resistance.', 
        'Laminate', 
        'Off White', 
        ARRAY['Laminate'],
        ARRAY['8x4'],
        '/wood_calibrated.png'
    )
ON CONFLICT DO NOTHING;

-- 7. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- 8. Enable Realtime Replication for Enquiries and Dealers
BEGIN;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.enquiries;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.dealers;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.enquiries;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dealers;
COMMIT;
