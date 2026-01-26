import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  // Get the project ref for cookie name
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/(.+)\.supabase\.co/)?.[1]
  const authCookieName = `sb-${projectRef}-auth-token`

  // Check if we have our custom auth cookie with full session
  const authCookie = cookieStore.get(authCookieName)

  if (authCookie?.value) {
    try {
      const sessionData = JSON.parse(authCookie.value)

      // Create a client and manually set the session
      const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${sessionData.access_token}`,
            },
          },
        }
      )

      return supabase
    } catch {
      // Fall through to standard SSR client
    }
  }

  // Fallback to standard SSR client
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore
          }
        },
      },
    }
  )
}
