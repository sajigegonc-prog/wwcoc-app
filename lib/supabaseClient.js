import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Realtime (postgres_changes) evaluates RLS using its own auth token, which
// does NOT automatically follow auth state changes (anonymous sign-in,
// upgrading to ID+password login, etc). Without this, realtime deliveries
// can silently be filtered out by RLS even though normal REST queries work fine.
supabase.auth.onAuthStateChange((_event, session) => {
  supabase.realtime.setAuth(session?.access_token)
})
