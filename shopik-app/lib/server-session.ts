import { cache } from 'react';
import { createClient } from './supabase/server';

// Reuse verification only within the same server render, never across requests.
export const readSession = cache(async () => {
  const client = await createClient();
  const claims = await client.auth.getClaims();
  return { client, ...claims };
});
