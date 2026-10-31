import { authDestination } from '@/lib/invites';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const destination=authDestination(request.nextUrl.searchParams.get('flow'));
  const code = request.nextUrl.searchParams.get('code');
  // Relative, allowlisted destinations retain the public origin behind proxies too.
  if (code && getSupabaseConfig()) {
    try {
      const supabase = await createClient(true);
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = new NextResponse(null,{status:307,headers:{Location:destination}});
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } catch {
      // Never expose OAuth codes, tokens, or provider errors in the response.
    }
  }
  const response = new NextResponse(null,{status:307,headers:{Location:destination==='/invite'?'/invite?error=oauth':'/login?error=oauth'}});
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
