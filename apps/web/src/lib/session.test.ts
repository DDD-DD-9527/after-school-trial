import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionBinding, SessionChangedError } from './session';

function fixture(initial: string | null = 'school-A') {
  const values = new Map<string, string>(initial ? [['token', initial]] : []);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let reloads = 0;
  const binding = createSessionBinding(storage, () => { reloads++; });
  return { storage, binding, reloads: () => reloads };
}

test('a tab cannot send a request with another tab newly selected school token before the storage event', () => {
  const { storage, binding, reloads } = fixture();
  assert.equal(binding.token(), 'school-A');
  storage.setItem('token', 'school-B');
  assert.throws(() => binding.token(), SessionChangedError);
  assert.equal(reloads(), 1);
  assert.throws(() => binding.token(), SessionChangedError);
  assert.equal(reloads(), 1);
});

test('legitimate same tab login and logout update the bound token without refreshing', () => {
  const { binding, storage, reloads } = fixture();
  binding.setToken('school-B');
  assert.equal(binding.token(), 'school-B');
  assert.equal(storage.getItem('token'), 'school-B');
  binding.setToken(null);
  assert.equal(binding.token(), null);
  assert.equal(storage.getItem('token'), null);
  assert.equal(reloads(), 0);
});

test('storage changes immediately invalidate the page, including remote logout', () => {
  const { binding, storage, reloads } = fixture();
  storage.removeItem('token');
  binding.storageChanged();
  assert.equal(reloads(), 1);
  assert.throws(() => binding.token(), SessionChangedError);
});

test('a late old response cannot clear or replace the new same tab account', () => {
  const { binding, storage, reloads } = fixture();
  const requestToken = binding.token();
  binding.setToken('school-B');
  assert.throws(() => binding.assertCurrent(requestToken), SessionChangedError);
  assert.equal(storage.getItem('token'), 'school-B');
  assert.equal(binding.token(), 'school-B');
  assert.equal(reloads(), 0);
});

test('a remote account switch also rejects an already in flight response', () => {
  const { binding, storage, reloads } = fixture();
  const requestToken = binding.token();
  storage.setItem('token', 'school-B');
  assert.throws(() => binding.assertCurrent(requestToken), SessionChangedError);
  assert.equal(reloads(), 1);
});
