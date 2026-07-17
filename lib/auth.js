import { supabase } from './supabaseClient'

export async function ensureAnonUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}
