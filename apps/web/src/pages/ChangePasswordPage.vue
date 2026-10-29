<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { state, homeOf, logout } from '../lib/auth';
import { toast } from '../lib/toast';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const router = useRouter();

async function submit() {
  if (newPassword.value.length < 6) return toast('新密码至少 6 位', 'error');
  if (newPassword.value !== confirmPassword.value) return toast('两次输入的新密码不一致', 'error');
  submitting.value = true;
  try {
    await api.post('/api/auth/change-password', { oldPassword: oldPassword.value, newPassword: newPassword.value });
    if (state.me) state.me.mustChangePassword = false;
    toast('密码已修改', 'success');
    const role = state.me?.role ?? 'parent';
    router.replace(homeOf(role));
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg px-4">
    <div class="w-full max-w-[380px]">
      <div class="mb-5 text-center">
        <div class="text-[20px] font-semibold">设置新密码</div>
        <div class="mt-1 text-[13px] text-ink-3">首次登录需要修改初始密码</div>
      </div>

      <div class="card card-pad">
        <div class="field">
          <label class="label">当前密码</label>
          <input v-model="oldPassword" type="password" class="input" placeholder="初始密码为 123456" />
        </div>
        <div class="field">
          <label class="label">新密码</label>
          <input v-model="newPassword" type="password" class="input" placeholder="至少 6 位" />
        </div>
        <div class="field">
          <label class="label">确认新密码</label>
          <input v-model="confirmPassword" type="password" class="input" @keyup.enter="submit" />
        </div>
        <button class="btn btn-primary btn-block btn-lg mt-2" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '保存并进入' }}
        </button>
        <button class="btn btn-ghost btn-block btn-sm mt-2" @click="logout">退出登录</button>
      </div>
    </div>
  </div>
</template>
