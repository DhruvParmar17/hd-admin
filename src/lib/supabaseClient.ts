import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://toqtuzdhojodxavjtpga.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_EieF2LUNJSd9JDyr0DNlvg_L7jGIyw-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
