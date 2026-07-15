import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push"

// VAPID keys should be set as environment variables on Supabase
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "BPqkSmNZWLP4Obdep1u-7LcxvNLueK8-NvaS6Yb1FQgkJsWt8h3m6UWcEZg4ema1uUzBwTKJN4b-FLad9DY4XnY"
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || ""
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:admin@hdply.com"

if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Pull registered admin subscriptions
    const { data: subscriptions, error } = await supabaseClient
      .from('admin_subscriptions')
      .select('*')

    if (error) throw error

    console.log(`Fetched ${subscriptions?.length || 0} subscriptions for dispatch...`)

    const payload = JSON.stringify({
      title: '🚨 New Completed Order Received!',
      body: 'A customer order has completed its countdown and is ready.'
    })

    const sendPromises = (subscriptions || []).map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: sub.keys
      }
      return webpush.sendNotification(pushSubscription, payload)
        .catch(async (err: any) => {
          console.error(`Failed to send push to ${sub.endpoint}:`, err)
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription has expired or is no longer valid, delete it
            await supabaseClient
              .from('admin_subscriptions')
              .delete()
              .eq('id', sub.id)
          }
        })
    })

    await Promise.all(sendPromises)

    return new Response(JSON.stringify({ success: true, count: subscriptions?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
