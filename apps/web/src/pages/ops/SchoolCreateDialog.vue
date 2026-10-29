<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { operations, errorText, validPhone, type CreateSchool } from '../../lib/operations';
import Modal from '../../ui/Modal.vue';
import AppIcon from '../../ui/AppIcon.vue';
const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'created', id: number): void }>();
const blank = (): CreateSchool => ({ name: '', code: '', term: '', contactName: '', contactPhone: '', adminName: '', adminPhone: '', adminPassword: '' });
const form = reactive(blank());
const submitting = ref(false);
const error = ref('');
const showPassword = ref(false);
watch(() => props.show, show => { if (show) { Object.assign(form, blank()); error.value = ''; showPassword.value = false; } });
function close() { if (!submitting.value) emit('close'); }
async function submit() {
  if (submitting.value) return;
  error.value = '';
  const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, key === 'adminPassword' ? value : value.trim()])) as unknown as CreateSchool;
  if (!body.name || !body.term || !body.adminName) { error.value = '请完整填写学校名称、当前学期和管理员姓名'; return; }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{1,31}$/.test(body.code)) { error.value = '学校编码使用 2–32 位字母、数字或短横线，并以字母或数字开头'; return; }
  if (!validPhone(body.adminPhone) || (body.contactPhone && !validPhone(body.contactPhone))) { error.value = '请输入正确的 11 位手机号'; return; }
  if (body.adminPassword.length < 6) { error.value = '管理员初始密码至少 6 位'; return; }
  submitting.value = true;
  try { const result = await operations.create(body); emit('created', result.school.id); }
  catch (e) { error.value = errorText(e, '学校开通失败，请重试'); }
  finally { submitting.value = false; }
}
</script>
<template>
  <Modal :show="show" title="开通学校" width="660px" @close="close">
    <form id="create-school-form" @submit.prevent="submit">
      <div class="create-intro"><span class="icon-tile icon-tile-blue"><AppIcon name="school" :size="22" /></span><p>创建学校工作空间，同时交付首位学校管理员。<br /><span>学校开通后，从空白资料开始，由学校自主准备课程和师生档案。</span></p></div>
      <fieldset :disabled="submitting"><legend class="form-section">学校信息</legend><div class="form-grid"><div class="field"><label class="label" for="school-name">学校名称 <span>*</span></label><input id="school-name" v-model="form.name" class="input" maxlength="80" placeholder="例如：明德实验学校" required /></div><div class="field"><label class="label" for="school-code">学校编码 <span>*</span></label><input id="school-code" v-model="form.code" class="input" maxlength="32" placeholder="例如：mingde" autocomplete="off" required /><p class="field-hint">学校成员登录时选择学校，编码创建后不可更改</p></div><div class="field"><label class="label" for="school-term">当前学期 <span>*</span></label><input id="school-term" v-model="form.term" class="input" maxlength="40" placeholder="例如：2026 秋季学期" required /></div><div class="field"><label class="label" for="school-contact">学校联系人</label><input id="school-contact" v-model="form.contactName" class="input" maxlength="40" placeholder="选填" /></div><div class="field"><label class="label" for="school-contact-phone">联系人手机号</label><input id="school-contact-phone" v-model="form.contactPhone" class="input" type="tel" inputmode="tel" maxlength="11" placeholder="选填" /></div></div><legend class="form-section">首位学校管理员</legend><div class="form-grid"><div class="field"><label class="label" for="school-admin-name">姓名 <span>*</span></label><input id="school-admin-name" v-model="form.adminName" class="input" maxlength="40" placeholder="输入管理员姓名" required /></div><div class="field"><label class="label" for="school-admin-phone">登录手机号 <span>*</span></label><input id="school-admin-phone" v-model="form.adminPhone" class="input" type="tel" inputmode="tel" maxlength="11" placeholder="11 位手机号" autocomplete="off" required /></div><div class="field password-field"><label class="label" for="school-admin-password">初始密码 <span>*</span></label><div class="relative"><input id="school-admin-password" v-model="form.adminPassword" class="input pr-12" :type="showPassword ? 'text' : 'password'" minlength="6" maxlength="128" placeholder="设置至少 6 位初始密码" autocomplete="new-password" required /><button class="icon-button absolute right-1 top-0.5" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="17" /></button></div><p class="field-hint">请线下安全交付，管理员首次登录必须修改密码</p></div></div></fieldset>
      <p v-if="error" class="form-error" role="alert"><AppIcon name="alert" :size="16" />{{ error }}</p>
    </form>
    <template #footer><button class="btn btn-secondary" :disabled="submitting" @click="close">取消</button><button class="btn btn-primary" type="submit" form="create-school-form" :disabled="submitting"><AppIcon v-if="!submitting" name="plus" :size="16" />{{ submitting ? '正在开通…' : '开通并创建管理员' }}</button></template>
  </Modal>
</template>
<style scoped>
.create-intro{display:flex;align-items:center;gap:13px;padding:4px 0 20px;font-size:13px;line-height:1.8}.create-intro p>span{color:var(--color-ink-3);font-size:11px}.form-section{display:block;width:100%;margin:3px 0 16px;padding-top:16px;border-top:1px solid var(--color-line);font-size:13px;font-weight:600}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.label>span{color:var(--color-danger)}.field-hint{margin-top:6px;color:var(--color-ink-3);font-size:10px;line-height:1.7}.password-field{grid-column:1/-1}.form-error{display:flex;align-items:flex-start;gap:8px;margin:4px 0;padding:10px 12px;border-radius:9px;background:#fff4f2;color:var(--color-danger);font-size:12px;line-height:1.8}.form-error svg{flex-shrink:0;margin-top:3px}@media(max-width:550px){.form-grid{grid-template-columns:1fr}.create-intro{align-items:flex-start}.create-intro .icon-tile{display:none}}
</style>
