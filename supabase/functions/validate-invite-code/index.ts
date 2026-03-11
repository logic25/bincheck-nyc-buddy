import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, inviteCode } = await req.json();

    if (!email || !password || !inviteCode) {
      return new Response(
        JSON.stringify({ error: 'Email, password, and invite code are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Validate invite code (case-insensitive)
    const normalizedCode = inviteCode.trim().toUpperCase();
    const { data: code, error: codeError } = await supabaseAdmin
      .from('invite_codes')
      .select('id, code, max_uses, use_count, expires_at, is_active')
      .eq('code', normalizedCode)
      .single();

    if (codeError || !code) {
      return new Response(
        JSON.stringify({ error: 'Invalid invite code. Please check the code and try again.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!code.is_active) {
      return new Response(
        JSON.stringify({ error: 'This invite code has been deactivated.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (code.expires_at && new Date(code.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'This invite code has expired.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (code.use_count >= code.max_uses) {
      return new Response(
        JSON.stringify({ error: 'This invite code has already been fully redeemed.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomic increment BEFORE creating user to prevent race conditions
    const { data: updatedCode, error: updateErr } = await supabaseAdmin
      .from('invite_codes')
      .update({ use_count: code.use_count + 1 })
      .eq('id', code.id)
      .lt('use_count', code.max_uses)
      .select()
      .single();

    if (updateErr || !updatedCode) {
      return new Response(
        JSON.stringify({ error: 'This invite code has already been fully redeemed.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the user account
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      // Rollback the use_count increment since user creation failed
      await supabaseAdmin
        .from('invite_codes')
        .update({ use_count: updatedCode.use_count - 1 })
        .eq('id', code.id);

      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        return new Response(
          JSON.stringify({ error: 'This email is already registered. Please sign in instead.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account created! You can now sign in.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('validate-invite-code error:', err);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
