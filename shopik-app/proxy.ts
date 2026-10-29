import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './lib/supabase/config';
import type { Database } from './lib/supabase/database.types';

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig();
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');
  if (!config) return response;

  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set('Cache-Control', 'private, no-store');
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Authorization is checked again on the server page and by database RLS.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ['/', '/expenses', '/tags', '/login', '/auth/:path*'],
};
