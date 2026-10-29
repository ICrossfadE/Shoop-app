import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  // Fixed internal destinations prevent user-controlled open redirects.
  if (code && getSupabaseConfig()) {
    try {
      const supabase = await createClient(true);
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL('/', request.url));
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } catch {
      // Never expose OAuth codes, tokens, or provider errors in the response.
    }
  }
  const response = NextResponse.redirect(new URL('/login?error=oauth', request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
