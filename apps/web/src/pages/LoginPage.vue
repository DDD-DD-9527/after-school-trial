<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { login, homeOf } from '../lib/auth';
import { toast } from '../lib/toast';

const phone = ref('13800000000');
const password = ref('admin123');
const loading = ref(false);
const router = useRouter();

const demos = [
  { label: '管理员', phone: '13800000000', password: 'admin123' },
  { label: '教师', phone: '13900000001', password: '123456' },
  { label: '家长', phone: '13700000001', password: '123456' },
];

function fill(d: (typeof demos)[number]) {
  phone.value = d.phone;
  password.value = d.password;
}

async function submit() {
  if (!phone.value || !password.value) return toast('请输入手机号和密码', 'error');
  loading.value = true;
  try {
    const me = await login(phone.value.trim(), password.value);
    if (me.mustChangePassword) router.replace('/change-password');
    else router.replace(homeOf(me.role));
  } catch (e: any) {
    toast(e.message || '登录失败', 'error');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg px-4">
    <div class="w-full max-w-[380px]">
      <div class="mb-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-[22px] text-white">课</div>
        <div class="text-[20px] font-semibold">课后服务</div>
        <div class="mt-1 text-[13px] text-ink-3">阳光小学 · 2026 秋季</div>
      </div>

      <div class="card card-pad">
        <div class="field">
          <label class="label">手机号</label>
          <input v-model="phone" class="input" placeholder="请输入手机号" @keyup.enter="submit" />
        </div>
        <div class="field">
          <label class="label">密码</label>
          <input v-model="password" type="password" class="input" placeholder="请输入密码" @keyup.enter="submit" />
        </div>
        <button class="btn btn-primary btn-block btn-lg mt-2" :disabled="loading" @click="submit">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </div>

      <div class="mt-4 rounded-xl border border-dashed border-line bg-white/60 p-3">
        <div class="mb-2 text-[12px] text-ink-3">试用账号（点击填充）</div>
        <div class="flex gap-2">
          <button v-for="d in demos" :key="d.phone" class="btn btn-secondary btn-sm flex-1" @click="fill(d)">
            {{ d.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
