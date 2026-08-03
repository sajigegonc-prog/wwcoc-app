import { supabase } from './supabaseClient'

export async function ensureAnonUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // avoid ambiguous chars (I,O,0,1)
const PASS_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomString(chars, len) {
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function emailFromId(id) {
  return `${id.trim().toLowerCase()}@wwcoc.local`
}

// Turns the current anonymous session into a permanent one, identified by
// a random ID + password (no real email involved, just a fake internal address).
export async function createLoginCredentials() {
  const id = randomString(ID_CHARS, 4) + '-' + randomString(ID_CHARS, 4)
  const password = randomString(PASS_CHARS, 12)
  const { error } = await supabase.auth.updateUser({
    email: emailFromId(id),
    password,
  })
  if (error) throw error
  return { id, password }
}

export async function loginWithId(id, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailFromId(id),
    password,
  })
  if (error) throw error
  return data.user
}

// Returns the display ID (e.g. "ABCD-1234") for the current logged-in user, or null if still anonymous.
export async function getCurrentLoginId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return null
  return user.email.split('@')[0].toUpperCase()
}

// Signs out of the current permanent (ID+password) account. Only meaningful
// when getCurrentLoginId() is non-null — signing out of a still-anonymous
// session would strand the user with no way back, so the UI should only
// offer this button once credentials have been issued.
export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
