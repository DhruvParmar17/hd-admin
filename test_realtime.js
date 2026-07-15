const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://toqtuzdhojodxavjtpga.supabase.co';
const supabaseAnonKey = 'sb_publishable_EieF2LUNJSd9JDyr0DNlvg_L7jGIyw-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('Connecting to Realtime...');
const channel = supabase
  .channel('test-realtime')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'enquiries' },
    (payload) => {
      console.log('REALTIME EVENT RECEIVED:', payload);
      process.exit(0);
    }
  )
  .subscribe((status) => {
    console.log('Subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('Subscribed! Creating test enquiry to trigger event...');
      createTestEnquiry();
    }
  });

async function createTestEnquiry() {
  const { data, error } = await supabase.from('enquiries').insert([
    {
      dealer_phone: '9892593525',
      dealer_name: 'Realtime Tester',
      delivery_location: 'Mumbai',
      comments: 'Testing Realtime Connection',
      status: 'Pending',
      payment_status: 'Pending'
    }
  ]).select();
  console.log('Insert response:', { data, error });
  if (error) {
    console.error('Insert failed:', error);
    process.exit(1);
  }
}

setTimeout(() => {
  console.log('Timed out waiting for realtime event. Realtime is not receiving broadcasts.');
  process.exit(1);
}, 15000);
