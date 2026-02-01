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
        from: 'Panel Flow <noreply@resend.dev>',
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

  // Validate next parameter to prevent open redirect attacks
  const isValidNext = nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.includes('://')
  const next = isValidNext ? nextParam : '/dashboard'

  if (!code) {
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
    console.error('Exchange error:', error)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Check if user is in allowed_users table
  const { data: { user } } = await supabase.auth.getUser()

  let redirectUrl = `${origin}${next}`

  if (user) {
    const { data: allowedUser } = await supabase
      .from('allowed_users')
      .select('email')
      .eq('email', user.email)
      .single()

    if (!allowedUser) {
      // User is not approved - send notification and redirect to pending page
      await sendApprovalNotification(user.email || 'unknown', user.user_metadata?.full_name || null)
      redirectUrl = `${origin}/pending-approval`
    }
  }

  // Create redirect response and set all cookies on it
  const response = NextResponse.redirect(redirectUrl)

  // CRITICAL: Copy session cookies to the redirect response
  // Without this, the session won't persist after the redirect
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
