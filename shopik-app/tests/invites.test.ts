import { test } from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {isInviteToken,authDestination,inviteCookieOptions} from '../lib/invites.ts';

// Generated bearer secrets are fixed-size; stored SHA256 values are not acceptable bearer input.
test('invitation tokens reject hashes, malformed values and arbitrary redirects',()=>{
  const tokens=new Set<string>();
  for(let i=0;i<100;i++){const token=randomBytes(32).toString('base64url');assert.equal(isInviteToken(token),true);tokens.add(token);assert.equal(isInviteToken(createHash('sha256').update(token).digest('hex')),false);}
  assert.equal(tokens.size,100);
  for(const value of [undefined,null,{},'', 'a'.repeat(42),'a'.repeat(44),'a'.repeat(42)+'/', 'a'.repeat(42)+'+', 'a'.repeat(43)+'\n'])assert.equal(isInviteToken(value),false);
  assert.equal(authDestination('invite'),'/invite');
  for(const flow of [undefined,'/invite','https://evil.invalid','//evil.invalid','invite?next=https://evil.invalid','INVITE'])assert.equal(authDestination(flow),'/');
  assert.equal(inviteCookieOptions.httpOnly,true);assert.equal(inviteCookieOptions.maxAge,1800);assert.equal(inviteCookieOptions.path,'/invite');
});
