import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { logger } from '@/lib/logger'

// Send email notification for new users needing approval
async function sendApprovalNotification(userEmail: string, userName: string | null) {
  // Using Resend API - you'll need to add RESEND_API_KEY to your environment
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    logger.debug('RESEND_API_KEY not configured, skipping approval notification', { action: 'auth-callback' })
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
        to: process.env.ADMIN_NOTIFICATION_EMAIL || 'doknoh@gmail.com',
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
      logger.error('Failed to send approval notification', { action: 'auth-callback' })
    } else {
      logger.info('Approval notification sent for new user', { action: 'auth-callback' })
    }
  } catch (error) {
    logger.error('Error sending approval notification', { action: 'auth-callback', error: error instanceof Error ? error.message : String(error) })
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/dashboard'

  logger.debug('Auth callback started', { action: 'auth-callback' })

  // Validate next parameter to prevent open redirect attacks
  const isValidNext = nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.includes('://')
  const next = isValidNext ? nextParam : '/dashboard'

  if (!code) {
    logger.debug('Auth callback missing code parameter', { action: 'auth-callback' })
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
          logger.debug('Auth callback setting cookies', { action: 'auth-callback', cookieCount: newCookies.length })
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
    logger.error('Auth callback code exchange failed', { action: 'auth-callback', error: error.message })
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  logger.debug('Auth callback session exchanged', { action: 'auth-callback' })

  // Check if user is in allowed_users table
  const { data: { user } } = await supabase.auth.getUser()

  logger.debug('Auth callback user retrieved', { action: 'auth-callback', userId: user?.id })

  let redirectUrl = `${origin}${next}`

  if (user) {
    const { data: allowedUser, error: allowedError } = await supabase
      .from('allowed_users')
      .select('email')
      .eq('email', user.email)
      .single()

    logger.debug('Auth callback allowed user check', { action: 'auth-callback', userId: user.id, isAllowed: !!allowedUser })

    if (!allowedUser) {
      // User is not approved - send notification and redirect to pending page
      logger.info('Auth callback user not in allowed_users, redirecting to pending-approval', { action: 'auth-callback', userId: user.id })
      await sendApprovalNotification(user.email || 'unknown', user.user_metadata?.full_name || null)
      redirectUrl = `${origin}/pending-approval`
    } else {
      logger.info('Auth callback user allowed, proceeding', { action: 'auth-callback', userId: user.id })
    }
  } else {
    logger.warn('Auth callback no user found after session exchange', { action: 'auth-callback' })
  }

  // Create redirect response and set all cookies on it
  const response = NextResponse.redirect(redirectUrl)

  // CRITICAL: Copy session cookies to the redirect response
  // Without this, the session won't persist after the redirect
  logger.debug('Auth callback setting cookies on redirect response', { action: 'auth-callback', cookieCount: cookiesToSet.length })
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

  logger.debug('Auth callback redirect complete', { action: 'auth-callback' })
  return response
}
