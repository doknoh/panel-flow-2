import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes that don't require approval check
const publicRoutes = ['/login', '/auth/callback', '/pending-approval']

export async function middleware(request: NextRequest) {
  // Just refresh the session, don't redirect
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Skip approval check for public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return response
  }

  // If user is NOT logged in and trying to access protected route, redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If user is logged in, check if they're approved
  const { data: allowedUser } = await supabase
    .from('allowed_users')
    .select('email')
    .eq('email', user.email)
    .single()

  if (!allowedUser) {
    // User is not approved - redirect to pending page
    return NextResponse.redirect(new URL('/pending-approval', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
