import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get('cookie') || ''
          return cookieHeader.split('; ').filter(Boolean).map(cookie => {
            const [name, ...rest] = cookie.split('=')
            return { name, value: rest.join('=') }
          })
        },
        setAll() {
          // We'll handle cookies manually below
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    console.error('Exchange error:', error)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message || 'no_session')}`)
  }

  // Manually create cookies from the session
  const { access_token, refresh_token } = data.session
  const maxAge = 60 * 60 * 24 * 365 // 1 year

  // Create HTML response that sets cookies and redirects
  const response = new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=${next}">
        <script>window.location.href = "${next}";</script>
      </head>
      <body>Redirecting...</body>
    </html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  )

  // Get the project ref from the URL
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/(.+)\.supabase\.co/)?.[1]

  // Set the auth cookies in the format Supabase expects
  response.cookies.set(`sb-${projectRef}-auth-token`, JSON.stringify({
    access_token,
    refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: 'bearer',
    user: data.session.user,
  }), {
    path: '/',
    maxAge,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  console.log('Session created, cookie set for project:', projectRef)
  return response
}
