import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenFromInviteLink } from '../lib/invite-link.ts';

// Pasted URLs are untrusted input: accept a local invitation, never an external navigation.
test('invite entry extracts only a bounded same-origin fragment secret',()=>{
  const origin='https://shopik.example', token='A'.repeat(43);
  assert.equal(tokenFromInviteLink(` ${origin}/invite#token=${token} `,origin),token);
  assert.equal(tokenFromInviteLink(`http://localhost:3000/invite#token=${token}`,'http://localhost:3000'),token);
  for(const link of [
    `https://evil.example/invite#token=${token}`,`http://shopik.example/invite#token=${token}`,
    `https://user@shopik.example/invite#token=${token}`,`${origin}/invite?token=${token}`,
    `${origin}/invite#token=${token}&token=${token}`,`${origin}/invite#token=${token}&next=/`,
    `${origin}/other#token=${token}`,`//shopik.example/invite#token=${token}`,`javascript:alert(1)`,
    `${origin}/invite#token=bad`,`${origin}/invite#token=${'A'.repeat(3000)}`,
  ])assert.equal(tokenFromInviteLink(link,origin),null);
});
