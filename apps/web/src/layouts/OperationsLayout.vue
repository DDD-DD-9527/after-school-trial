<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { state, logout } from '../lib/auth';
import AppIcon from '../ui/AppIcon.vue';
const route = useRoute();
const menuOpen = ref(false);
const sidebar = ref<HTMLElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);
const links = [{ to: '/ops', label: '运营工作台', icon: 'grid' }, { to: '/ops/schools', label: '学校管理', icon: 'school' }];
const active = (to: string) => to === '/ops' ? route.path === to : route.path.startsWith(to);
const currentPage = computed(() => route.path.match(/^\/ops\/schools\/[^/]+/) ? '学校详情' : links.find(link => active(link.to))?.label || '运营工作台');
const today = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
watch(() => route.path, () => { menuOpen.value = false; });
async function openMenu() { menuOpen.value = true; await nextTick(); sidebar.value?.querySelector<HTMLElement>('a[aria-current="page"]')?.focus(); }
function closeMenu() { menuOpen.value = false; menuButton.value?.focus(); }
function onMenuKey(event: KeyboardEvent) {
  if (!menuOpen.value) return;
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
  if (event.key !== 'Tab') return;
  const nodes = sidebar.value?.querySelectorAll<HTMLElement>('a, button');
  if (!nodes?.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
</script>
<template>
  <div class="ops-shell">
    <a class="skip-link" href="#operations-content">跳转到页面内容</a>
    <button v-if="menuOpen" class="ops-backdrop" aria-label="关闭运营导航" @click="closeMenu" />
    <aside ref="sidebar" class="ops-sidebar" :class="{ 'is-open': menuOpen }" @keydown="onMenuKey">
      <router-link to="/ops" class="ops-brand"><span class="ops-brand-mark"><AppIcon name="book" :size="22" /></span><span>课后服务<small>把服务，带到更多学校</small></span></router-link>
      <div class="ops-context"><span class="icon-tile icon-tile-blue"><AppIcon name="shield" :size="20" /></span><div><strong>平台运营中心</strong><small>学校开通与服务支持</small></div><span class="context-dot" /></div>
      <nav class="ops-nav" aria-label="运营导航"><div class="ops-nav-label">运营管理</div><router-link v-for="link in links" :key="link.to" :to="link.to" :class="{ 'is-active': active(link.to) }" :aria-current="active(link.to) ? 'page' : undefined"><AppIcon :name="link.icon" :size="19" />{{ link.label }}<span v-if="active(link.to)" class="nav-dot" /></router-link></nav>
      <div class="ops-sidebar-note"><AppIcon name="leaf" :size="25" /><p>一所学校，一份有序的开始。<br />让每一次服务交付都清晰可见。</p></div>
      <div class="ops-user"><span class="ops-avatar">{{ state.me?.name?.slice(0, 1) || '运' }}</span><div><strong>{{ state.me?.name || '运营管理员' }}</strong><small>运营管理员</small></div><button class="icon-button ml-auto" aria-label="退出登录" title="退出登录" @click="logout"><AppIcon name="log-out" :size="18" /></button></div>
    </aside>
    <div class="ops-body"><header class="ops-header"><div class="flex min-w-0 items-center gap-3"><button ref="menuButton" class="icon-button ops-menu-toggle" aria-label="打开运营导航" :aria-expanded="menuOpen" @click="openMenu"><AppIcon name="menu" /></button><span class="hidden text-[13px] text-ink-3 sm:inline">运营中心</span><AppIcon class="hidden text-[#b3bdcf] sm:block" name="chevron-right" :size="14" /><span class="truncate text-[13px] font-medium">{{ currentPage }}</span></div><div class="flex items-center gap-4"><span class="hidden text-[12px] text-ink-3 sm:inline">{{ today }}</span><span class="badge badge-blue">运营管理员</span></div></header><main id="operations-content" class="ops-main" tabindex="-1"><router-view /></main><footer class="ops-footer"><span>课后服务 · 平台运营中心</span><span>让每一次服务，都有好的开始</span></footer></div>
  </div>
</template>
<style scoped>
.ops-shell{display:flex;min-height:100vh}.ops-sidebar{position:sticky;top:0;z-index:40;display:flex;flex-direction:column;width:242px;height:100vh;flex-shrink:0;border-right:1px solid var(--color-line);background:#fff}.ops-brand{display:flex;align-items:center;gap:11px;padding:27px 22px 24px;color:var(--color-ink);text-decoration:none;font-size:18px;font-weight:700}.ops-brand-mark{display:grid;place-items:center;width:38px;height:40px;border-radius:12px 12px 12px 4px;background:var(--color-brand);color:#fff;box-shadow:0 4px 12px #3156d320}.ops-brand small{display:block;margin-top:3px;font-size:10px;font-weight:400;color:var(--color-ink-3)}.ops-context{display:flex;align-items:center;gap:10px;margin:0 16px 22px;padding:13px 12px;border:1px solid #e0e6f5;border-radius:12px;background:#fafbff}.ops-context .icon-tile{width:32px;height:34px;border-radius:9px}.ops-context strong{display:block;font-size:12px;font-weight:600}.ops-context small{display:block;margin-top:2px;font-size:10px;color:var(--color-ink-3)}.context-dot{width:5px;height:5px;margin-left:auto;border-radius:50%;background:var(--color-ok)}.ops-nav{padding:0 12px}.ops-nav-label{padding:7px 13px;font-size:11px;letter-spacing:1px;color:#8792a5}.ops-nav a{display:flex;align-items:center;gap:12px;margin:4px 0;padding:11px 14px;border-radius:10px;color:var(--color-ink-2);text-decoration:none;font-size:13px}.ops-nav a:hover{background:#f7f8fc;color:var(--color-brand)}.ops-nav a.is-active{background:var(--color-brand-soft);color:var(--color-brand);font-weight:600}.nav-dot{width:5px;height:5px;margin-left:auto;border-radius:50%;background:var(--color-brand)}.ops-sidebar-note{margin-top:auto;padding:30px 28px;color:#98afa4}.ops-sidebar-note p{margin-top:10px;font-size:10px;line-height:1.9;color:var(--color-ink-3)}.ops-user{display:flex;align-items:center;gap:10px;margin:0 16px;padding:18px 0;border-top:1px solid var(--color-line)}.ops-avatar{display:grid;place-items:center;width:35px;height:35px;border-radius:11px;background:#eef1f8;font-size:13px;font-weight:600;color:#647299}.ops-user strong{display:block;font-size:12px;font-weight:600}.ops-user small{font-size:10px;color:var(--color-ink-3)}.ops-body{display:flex;flex:1;min-width:0;flex-direction:column}.ops-header{height:74px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 36px;border-bottom:1px solid var(--color-line);background:#ffffffd9}.ops-main{flex:1;min-width:0;max-width:1680px;width:100%;margin:0 auto;padding:30px 36px 38px;outline:none}.ops-footer{display:flex;justify-content:space-between;gap:16px;margin:0 36px;padding:20px 0 22px;border-top:1px solid var(--color-line);font-size:11px;color:#8a95a6}.ops-menu-toggle{display:none}.ops-backdrop{position:fixed;inset:0;z-index:35;background:#18223f40;backdrop-filter:blur(2px)}@media(max-width:1100px){.ops-main{padding:26px 24px}.ops-header{padding:0 24px}.ops-footer{margin:0 24px}}@media(max-width:850px){.ops-sidebar{position:fixed;left:0;top:0;visibility:hidden;transform:translateX(-100%);transition:transform .2s,visibility .2s}.ops-sidebar.is-open{visibility:visible;transform:translateX(0)}.ops-menu-toggle{display:flex}.ops-header{height:64px;padding:0 18px}.ops-main{padding:24px 16px}.ops-footer{margin:0 16px}.ops-footer span:last-child{display:none}}
</style>
