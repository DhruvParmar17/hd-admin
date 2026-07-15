const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://toqtuzdhojodxavjtpga.supabase.co';
const supabaseAnonKey = 'sb_publishable_EieF2LUNJSd9JDyr0DNlvg_L7jGIyw-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Inserting test enquiry with quality...');
  try {
    const { data: enq, error: eErr } = await supabase
      .from('enquiries')
      .insert([
        {
          dealer_phone: '9892593525',
          dealer_name: 'dhruv parmar',
          delivery_location: 'sion',
          comments: 'Test quality categories',
          status: 'Pending',
          payment_status: 'Pending'
        }
      ])
      .select()
      .single();

    if (eErr) throw eErr;
    console.log('Enquiry created:', enq.id);

    const { error: iErr } = await supabase
      .from('enquiry_items')
      .insert([
        {
          enquiry_id: enq.id,
          product_id: '541048ed-3f99-42d3-91ce-9d8ecd131b7b', // Commercial Plywood
          thickness: '19mm',
          size: '8x4',
          quantity: 50,
          quality: 'Marine Ply',
          rate: 120
        }
      ]);

    if (iErr) throw iErr;
    console.log('Enquiry item created successfully!');
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
