import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { computed, nextTick, reactive, ref, watch } from 'vue';

async function fixture() {
  const route = reactive({ params: { id: '1' } });
  let finish: (value?: unknown) => void = () => {};
  let fail: (reason?: unknown) => void = () => {};
  const deferred = () => new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const operations = {
    detail: async (id: string) => ({ school: { id: Number(id), name: `School ${id}`, term: '2026', status: 'active' }, admins: [], stats: {}, recentEvents: [] }),
    update: deferred, createAdmin: deferred, updateAdmin: deferred,
  };
  const sfc = readFileSync(new URL('./SchoolDetailPage.vue', import.meta.url), 'utf8');
  const script = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1].replace(/^import .*;\r?$/gm, '');
  const source = ts.transpileModule(`${script}\nglobalThis.exposed = { form, formError, saving, saveSettings, adminDialog, adminForm, adminSaving, adminError, openAdmin, saveAdmin };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const context = vm.createContext({ useRoute: () => route, ref, reactive, computed, watch, operations, toast: () => {}, errorText: (e: Error) => e.message, validPhone: () => true, money: () => '', dateTime: () => '', eventLabel: () => '' });
  vm.runInContext(source, context);
  const state = context.exposed;
  const flush = async () => { await nextTick(); await Promise.resolve(); await Promise.resolve(); };
  await flush();
  return { state, finish: (value?: unknown) => finish(value), fail: (error: Error) => fail(error), switchSchool: async () => { route.params.id = '2'; await flush(); } };
}

test('a late previous school settings save preserves the new school unsaved form', async () => {
  const { state, finish, switchSchool } = await fixture();
  state.form.name = 'School 1 edit';
  const pending = state.saveSettings();
  await switchSchool();
  state.form.name = 'School 2 unsaved';
  finish(); await pending;
  assert.equal(state.form.name, 'School 2 unsaved');
  assert.equal(state.saving.value, false);
});

test('a late administrator save cannot close a new school administrator dialog', async () => {
  const { state, finish, switchSchool } = await fixture();
  state.openAdmin(); Object.assign(state.adminForm, { name: 'A', phone: '13800000000', password: '123456' });
  const pending = state.saveAdmin();
  await switchSchool();
  state.openAdmin(); Object.assign(state.adminForm, { name: 'B unsaved', password: 'new-password' });
  finish(); await pending;
  assert.equal(state.adminDialog.value, true);
  assert.equal(state.adminForm.name, 'B unsaved');
  assert.equal(state.adminForm.password, 'new-password');
});

test('a late save failure cannot display another school error', async () => {
  const { state, fail, switchSchool } = await fixture();
  const pending = state.saveSettings();
  await switchSchool();
  fail(new Error('School 1 save rejected')); await pending;
  assert.equal(state.formError.value, '');
});
