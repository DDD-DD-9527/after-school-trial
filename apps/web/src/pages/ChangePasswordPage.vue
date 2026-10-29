<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { state, homeOf, logout } from '../lib/auth';
import { toast } from '../lib/toast';
import AppIcon from '../ui/AppIcon.vue';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const error = ref('');
const success = ref('');
const router = useRouter();

async function submit() {
  if (submitting.value || success.value) return;
  error.value = '';
  if (!oldPassword.value) { error.value = '请输入当前密码'; return; }
  if (newPassword.value.length < 6) { error.value = '新密码至少 6 位'; return; }
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的新密码不一致'; return; }
  submitting.value = true;
  try {
    await api.post('/api/auth/change-password', { oldPassword: oldPassword.value, newPassword: newPassword.value });
    if (state.me) state.me.mustChangePassword = false;
    success.value = '密码已修改，正在进入工作空间…';
    toast('密码已修改', 'success');
    router.replace(homeOf(state.me?.role ?? 'parent'));
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '密码暂时无法修改，请重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="password-page">
    <header class="password-header"><div class="password-brand"><span><AppIcon name="book" :size="22" /></span>课后服务</div><span class="text-[12px] text-ink-3">账号安全</span></header>
    <main class="password-main">
      <section class="password-card" aria-labelledby="password-title">
        <div class="password-emblem"><AppIcon name="shield" :size="29" /><span><AppIcon name="check" :size="11" /></span></div>
        <p class="eyebrow mt-6">欢迎开启课后时光</p>
        <h1 id="password-title">设置你的新密码</h1>
        <p class="password-intro">首次登录，请先修改初始密码。<br />为自己的账号设置一份专属保护。</p>
        <div v-if="state.me" class="account-note"><AppIcon name="user" :size="15" /><span>{{ state.me.name }}<span v-if="state.me.phone" class="ml-2 text-ink-3">{{ state.me.phone }}</span></span></div>
        <form class="password-form" @submit.prevent="submit">
          <div class="password-field"><label for="current-password">当前密码</label><div class="password-input"><AppIcon name="shield" :size="17" /><input id="current-password" v-model="oldPassword" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入当前使用的密码" :disabled="submitting || !!success" :aria-describedby="error ? 'password-error' : undefined" /></div></div>
          <div class="password-field"><label for="new-password">新密码<span>至少 6 位</span></label><div class="password-input"><AppIcon name="shield" :size="17" /><input id="new-password" v-model="newPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="设置新的登录密码" :disabled="submitting || !!success" :aria-describedby="error ? 'password-error' : 'password-rule'" /></div></div>
          <div class="password-field"><label for="confirm-password">确认新密码</label><div class="password-input"><AppIcon name="check-circle" :size="17" /><input id="confirm-password" v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="请再次输入新密码" :disabled="submitting || !!success" :aria-describedby="error ? 'password-error' : undefined" /></div></div>
          <div class="password-options"><span id="password-rule">新密码不能与当前密码相同</span><button type="button" :aria-pressed="showPassword" :disabled="submitting || !!success" @click="showPassword = !showPassword"><AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />{{ showPassword ? '隐藏密码' : '显示密码' }}</button></div>
          <p v-if="error" id="password-error" class="password-feedback error" role="alert"><AppIcon name="alert" :size="16" />{{ error }}</p>
          <p v-if="success" class="password-feedback success" role="status"><AppIcon name="check-circle" :size="16" />{{ success }}</p>
          <button class="btn btn-primary btn-block btn-lg password-submit" type="submit" :disabled="submitting || !!success"><span>{{ submitting ? '正在保存…' : success ? '密码已更新' : '保存并进入' }}</span><AppIcon v-if="!submitting && !success" name="arrow-right" :size="18" /></button>
        </form>
        <div class="password-card-footer"><button type="button" :disabled="submitting" @click="logout"><AppIcon name="log-out" :size="15" />退出登录</button><span>为每一份关心，做好保护</span></div>
      </section>
    </main>
    <footer class="password-footer">课后服务 · 让放学后的成长，从容发生</footer>
  </div>
</template>

<style scoped>
.password-page { display: flex; min-height: 100vh; flex-direction: column; background: #f7f8fc; }
.password-header { display: flex; width: 100%; max-width: 1440px; align-items: center; justify-content: space-between; margin: 0 auto; padding: 30px 54px; }
.password-brand { display: flex; align-items: center; gap: 11px; font-size: 20px; font-weight: 700; }
.password-brand > span { display: grid; width: 40px; height: 42px; place-items: center; border-radius: 12px 12px 12px 4px; background: var(--color-brand); color: #fff; box-shadow: 0 4px 12px #3156d31a; }
.password-main { display: grid; flex: 1; place-items: center; padding: 12px 20px 36px; }
.password-card { width: 100%; max-width: 450px; padding: 34px 36px 0; border: 1px solid #e5e9f3; border-radius: 22px; background: #fff; box-shadow: 0 14px 50px #24324b06; }
.password-emblem { position: relative; display: grid; width: 60px; height: 60px; place-items: center; border: 6px solid #f5f7fe; border-radius: 19px; background: #eaf0ff; color: var(--color-brand); }
.password-emblem > span { position: absolute; right: -4px; bottom: -3px; display: grid; width: 21px; height: 21px; place-items: center; border: 3px solid #fff; border-radius: 50%; background: #157f74; color: #fff; }
.password-card h1 { font-size: 25px; font-weight: 700; line-height: 1.5; letter-spacing: -.7px; }
.password-intro { margin-top: 10px; color: var(--color-ink-2); font-size: 13px; line-height: 1.9; }
.account-note { display: flex; align-items: center; gap: 8px; margin-top: 18px; padding: 10px 12px; border-radius: 9px; background: #f8f9fd; color: var(--color-ink-2); font-size: 12px; overflow-wrap: anywhere; }
.account-note > svg { flex: none; color: #8a98b2; }
.password-form { margin-top: 24px; }
.password-field { margin-bottom: 18px; }
.password-field label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: var(--color-ink-2); font-size: 12px; font-weight: 500; }
.password-field label span { color: var(--color-ink-3); font-size: 11px; font-weight: 400; }
.password-input { display: flex; height: 46px; align-items: center; gap: 10px; padding: 0 13px; border: 1px solid var(--color-line); border-radius: 10px; background: #fdfdff; color: #9aa5b8; }
.password-input:focus-within { border-color: var(--color-brand); box-shadow: 0 0 0 3px #3156d30d; }
.password-input input { width: 100%; min-width: 0; background: transparent; color: var(--color-ink); font-size: 13px; outline: none; }
.password-options { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: -3px; color: var(--color-ink-3); font-size: 11px; line-height: 1.8; }
.password-options button { display: inline-flex; flex: none; align-items: center; gap: 5px; min-height: 32px; color: var(--color-ink-2); }
.password-feedback { display: flex; align-items: flex-start; gap: 8px; margin-top: 13px; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.8; }
.password-feedback > svg { flex: none; margin-top: 2px; }
.password-feedback.error { background: #fff4f2; color: var(--color-danger); }
.password-feedback.success { background: #edf7f1; color: #157f74; }
.password-submit { justify-content: space-between; margin-top: 20px; padding: 0 18px; font-size: 13px; }
.password-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 24px; padding: 18px 0; border-top: 1px solid var(--color-line); color: var(--color-ink-3); font-size: 10px; }
.password-card-footer button { display: inline-flex; min-height: 30px; align-items: center; gap: 6px; color: var(--color-ink-2); font-size: 12px; }
.password-card-footer button:disabled { opacity: .5; }
.password-footer { padding: 12px 20px 23px; text-align: center; color: #9ba4b5; font-size: 11px; }
@media (max-width: 600px) { .password-header { padding: 23px 25px; } .password-brand { font-size: 18px; } .password-brand > span { width: 34px; height: 36px; } .password-main { padding: 6px 20px 25px; } .password-card { padding: 28px 26px 0; } .password-card h1 { font-size: 23px; } }
@media (max-width: 380px) { .password-main { padding-left: 14px; padding-right: 14px; } .password-card { padding: 25px 21px 0; } .password-header { padding: 20px; } .password-card-footer { font-size: 9px; } }
</style>
