import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dealer_phone, dealer_name, delivery_location, comments, items } = body;

    if (!dealer_phone || !dealer_name || !delivery_location || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let enquiryId: string;
    let isMocked = false;

    try {
      // 1. Insert header into enquiries table
      const { data: enquiryRow, error: enqError } = await supabase
        .from('enquiries')
        .insert([
          {
            dealer_phone,
            dealer_name,
            delivery_location,
            comments: comments || null,
            status: 'Pending',
          },
        ])
        .select()
        .single();

      if (enqError) throw enqError;
      enquiryId = enquiryRow.id;

      // 2. Insert items into enquiry_items table
      const itemsToInsert = items.map((item: { product_id: string; thickness: string; size: string; quantity: number; quality?: string }) => ({
        enquiry_id: enquiryId,
        product_id: item.product_id,
        thickness: item.thickness,
        size: item.size,
        quantity: item.quantity,
        quality: item.quality || null,
      }));

      const { error: itemsError } = await supabase.from('enquiry_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

    } catch (dbErr) {
      console.warn('Supabase DB Insert failed. Simulating offline storage fallback:', dbErr);
      // Simulate ID if DB isn't fully configured/seeded
      enquiryId = `ENQ-${Math.floor(100000 + Math.random() * 900000)}`;
      isMocked = true;
    }

    // 3. Structure Webhook Notification Data Packet
    const targetNumbers = ['9892593525', '9820518536', '9820358186'];
    
    // Construct items summary for message payload
    let itemsText = '';
    items.forEach((item: { name?: string; thickness: string; size: string; quantity: number; quality?: string }, idx: number) => {
      itemsText += `\n- ${item.name || 'Item'} (${item.thickness}, ${item.size}${item.quality ? `, ${item.quality}` : ''}) x ${item.quantity} Sheets`;
    });

    const webhookPayload = {
      source: 'HD PLY Wholesale Portal',
      event: 'enquiry.created',
      enquiry_id: enquiryId,
      timestamp: new Date().toISOString(),
      sender: {
        name: dealer_name,
        phone: dealer_phone,
        location: delivery_location,
        comments: comments || 'None',
      },
      recipients: targetNumbers,
      message_payload: `New Enquiry from HD PLY!\n\nDealer: ${dealer_name}\nPhone: ${dealer_phone}\nLocation: ${delivery_location}\nItems Requested:${itemsText}\nRef ID: ${enquiryId}`,
    };

    // Log the payload to the server logs
    console.log('----------------------------------------');
    console.log('WEBHOOK NOTIFICATION SYSTEM PAYLOAD GENERATED:');
    console.log(JSON.stringify(webhookPayload, null, 2));
    console.log('----------------------------------------');

    // Simulate posting payload to SMS/WhatsApp webhook gateway (e.g. Twilio/Infobip)
    // If we had a live webhook url, we would do:
    // if (process.env.NOTIFICATION_WEBHOOK_URL) {
    //   await fetch(process.env.NOTIFICATION_WEBHOOK_URL, { method: 'POST', body: JSON.stringify(webhookPayload) });
    // }

    return NextResponse.json({
      success: true,
      enquiryId,
      isMocked,
      webhook_payload: webhookPayload,
    });
  } catch (err: unknown) {
    console.error('Error handling wholesale Enquiry:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
