const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://toqtuzdhojodxavjtpga.supabase.co';
const supabaseAnonKey = 'sb_publishable_EieF2LUNJSd9JDyr0DNlvg_L7jGIyw-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  console.log('Inspecting Supabase tables...');
  try {
    const { data: products, error: pErr } = await supabase.from('products').select('*');
    console.log('Products:', JSON.stringify(products, null, 2));
  } catch (err) {
    console.error('Inspection crash:', err);
  }
}

inspect();
