import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Get the project ref for cookie name
  const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1]
  const authCookieName = `sb-${projectRef}-auth-token`

  // Try to get session from our custom cookie
  const cookieValue = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${authCookieName}=`))
    ?.split('=')[1]

  if (cookieValue) {
    try {
      const sessionData = JSON.parse(decodeURIComponent(cookieValue))

      // Create client with manual auth header
      return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${sessionData.access_token}`,
          },
        },
      })
    } catch (e) {
      console.error('Failed to parse auth cookie:', e)
    }
  }

  // Fallback to standard client
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}
