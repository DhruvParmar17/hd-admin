const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://toqtuzdhojodxavjtpga.supabase.co';
const supabaseAnonKey = 'sb_publishable_EieF2LUNJSd9JDyr0DNlvg_L7jGIyw-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase.from('payment_logs').select('*').limit(1);
  console.log('Payment logs check:', { data, error });
}
run();
