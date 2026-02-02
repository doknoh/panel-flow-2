import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Send email notification for new users needing approval
async function sendApprovalNotification(userEmail: string, userName: string | null) {
  // Using Resend API - you'll need to add RESEND_API_KEY to your environment
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.log('RESEND_API_KEY not configured, skipping email notification')
    console.log('To enable notifications, add RESEND_API_KEY to your Vercel environment variables')
    return
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Panel Flow <onboarding@resend.dev>',
        to: 'doknoh@gmail.com',
        subject: 'New User Awaiting Approval - Panel Flow',
        html: `
          <h2>New User Signup</h2>
          <p>A new user has signed up for Panel Flow and is awaiting your approval:</p>
          <ul>
            <li><strong>Email:</strong> ${userEmail}</li>
            <li><strong>Name:</strong> ${userName || 'Not provided'}</li>
          </ul>
          <p>To approve this user, add their email to the allowed_users table in your Supabase dashboard.</p>
          <p><a href="https://supabase.com/dashboard">Go to Supabase Dashboard</a></p>
        `,
      }),
    })

    if (!response.ok) {
      console.error('Failed to send approval notification:', await response.text())
    } else {
      console.log('Approval notification sent for:', userEmail)
    }
  } catch (error) {
    console.error('Error sending approval notification:', error)
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/dashboard'

  console.log('[Auth Callback] Starting auth callback...')

  // Validate next parameter to prevent open redirect attacks
  const isValidNext = nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.includes('://')
  const next = isValidNext ? nextParam : '/dashboard'

  if (!code) {
    console.log('[Auth Callback] No code provided, redirecting to login')
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieStore = await cookies()

  // Track cookies that need to be set on the response
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(newCookies) {
          console.log('[Auth Callback] Setting cookies:', newCookies.map(c => c.name))
          newCookies.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
            // Also track for the redirect response
            cookiesToSet.push({ name, value, options })
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[Auth Callback] Exchange error:', error)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  console.log('[Auth Callback] Session exchanged successfully')

  // Check if user is in allowed_users table
  const { data: { user } } = await supabase.auth.getUser()

  console.log('[Auth Callback] User:', user?.email || 'no user')

  let redirectUrl = `${origin}${next}`

  if (user) {
    const { data: allowedUser, error: allowedError } = await supabase
      .from('allowed_users')
      .select('email')
      .eq('email', user.email)
      .single()

    console.log('[Auth Callback] Allowed user check:', { allowedUser, allowedError: allowedError?.message })

    if (!allowedUser) {
      // User is not approved - send notification and redirect to pending page
      console.log('[Auth Callback] User NOT in allowed_users, sending notification and redirecting to pending-approval')
      await sendApprovalNotification(user.email || 'unknown', user.user_metadata?.full_name || null)
      redirectUrl = `${origin}/pending-approval`
    } else {
      console.log('[Auth Callback] User IS allowed, redirecting to:', next)
    }
  } else {
    console.log('[Auth Callback] No user found after exchange, this should not happen')
  }

  // Create redirect response and set all cookies on it
  const response = NextResponse.redirect(redirectUrl)

  // CRITICAL: Copy session cookies to the redirect response
  // Without this, the session won't persist after the redirect
  console.log('[Auth Callback] Setting', cookiesToSet.length, 'cookies on redirect response')
  cookiesToSet.forEach(({ name, value, options }) => {
    // Map Supabase cookie options to Next.js compatible options
    response.cookies.set(name, value, {
      path: options?.path,
      domain: options?.domain,
      maxAge: options?.maxAge,
      httpOnly: options?.httpOnly,
      secure: options?.secure,
      sameSite: options?.sameSite as 'strict' | 'lax' | 'none' | undefined,
    })
  })

  console.log('[Auth Callback] Redirecting to:', redirectUrl)
  return response
}
