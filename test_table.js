const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://toqtuzdhojodxavjtpga.supabase.co';
const supabaseAnonKey = 'sb_publishable_EieF2LUNJSd9JDyr0DNlvg_L7jGIyw-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function run() {
  const { data, error } = await supabase.from('admin_subscriptions').select('*').limit(1);
  console.log('admin_subscriptions select:', { data, error });
}
run();
