<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { state, logout } from '../lib/auth';
import { unread, refreshUnread } from '../lib/notify';
import AppIcon from '../ui/AppIcon.vue';
const router = useRouter();
const route = useRoute();
const menuOpen = ref(false);
const sidebar = ref<HTMLElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);
onMounted(() => refreshUnread().catch(() => {}));
watch(() => route.path, () => { menuOpen.value = false; });
const groups = [
  { title: '日常工作', items: [
    { to: '/admin', label: '工作台', icon: 'grid' },
    { to: '/admin/attendance', label: '学生考勤', icon: 'users' },
    { to: '/admin/teacher-attendance', label: '教师考勤', icon: 'check-circle' },
  ] },
  { title: '课程与报名', items: [
    { to: '/admin/courses', label: '课程管理', icon: 'book' },
    { to: '/admin/schedule', label: '排课安排', icon: 'calendar' },
    { to: '/admin/plans', label: '报名计划', icon: 'file' },
    { to: '/admin/finance', label: '费用管理', icon: 'wallet' },
  ] },
  { title: '师生档案', items: [
    { to: '/admin/classes', label: '班级管理', icon: 'school' },
    { to: '/admin/students', label: '学生档案', icon: 'users' },
    { to: '/admin/teachers', label: '教师档案', icon: 'user' },
    { to: '/admin/import', label: '数据导入', icon: 'upload' },
  ] },
];
const active = (to: string) => route.path === to || (to !== '/admin' && route.path.startsWith(`${to}/`));
const currentPage = computed(() => groups.flatMap(g => g.items).find(item => active(item.to))?.label ?? '消息中心');
const avatar = computed(() => state.me?.name?.slice(0, 1) || '管');
async function openMenu() {
  menuOpen.value = true;
  await nextTick();
  const first = sidebar.value?.querySelector<HTMLElement>('a[aria-current="page"]')
    ?? sidebar.value?.querySelector<HTMLElement>('a, button');
  first?.focus();
}
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
  <div class="admin-shell">
    <a class="skip-link" href="#admin-content">跳转到页面内容</a>
    <button v-if="menuOpen" class="admin-sidebar-backdrop" aria-label="关闭导航" @click="closeMenu" />
    <aside ref="sidebar" class="admin-sidebar" :class="{ 'is-open': menuOpen }" @keydown="onMenuKey">
      <router-link to="/admin" class="app-brand"><span class="brand-mark"><AppIcon name="book" :size="22" /></span><span>课后服务<span class="brand-caption">让每一段课后时光有序发生</span></span></router-link>
      <div class="school-context"><span class="school-context-icon"><AppIcon name="school" :size="18" /></span><div><div class="font-semibold text-ink">{{ state.me?.school?.name || '学校空间' }}</div><div class="mt-0.5 text-[11px] text-ink-3">{{ state.me?.school?.term || '学期待设置' }}</div></div><span class="ml-auto h-1.5 w-1.5 rounded-full bg-ok" /></div>
      <nav class="admin-nav" aria-label="学校管理导航">
        <div v-for="group in groups" :key="group.title" class="admin-nav-group"><div class="admin-nav-label">{{ group.title }}</div><router-link v-for="item in group.items" :key="item.to" :to="item.to" class="admin-nav-link" :class="{ 'is-active': active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined"><AppIcon :name="item.icon" :size="19" /><span>{{ item.label }}</span><span v-if="active(item.to)" class="nav-active-dot" /></router-link></div>
      </nav>
      <div class="admin-sidebar-footer"><span class="user-avatar">{{ avatar }}</span><div class="min-w-0"><div class="truncate text-[13px] font-semibold">{{ state.me?.name }}</div><div class="text-[11px] text-ink-3">学校管理员</div></div><button class="icon-button ml-auto" title="退出登录" aria-label="退出登录" @click="logout"><AppIcon name="log-out" :size="18" /></button></div>
    </aside>
    <div class="admin-body">
      <header class="admin-header"><div class="flex min-w-0 items-center gap-3"><button ref="menuButton" class="icon-button admin-menu-toggle" aria-label="打开导航" :aria-expanded="menuOpen" @click="openMenu"><AppIcon name="menu" /></button><span class="hidden text-[13px] text-ink-3 sm:inline">学校管理</span><AppIcon class="hidden text-[#b3bdcf] sm:block" name="chevron-right" :size="14" /><span class="truncate text-[13px] font-medium">{{ currentPage }}</span></div><div class="flex items-center gap-4"><span class="hidden text-[12px] text-ink-3 sm:inline">{{ state.me?.school?.term || '' }}</span><button class="icon-button relative" aria-label="消息中心" @click="router.push('/admin/messages')"><AppIcon name="bell" /><span v-if="unread > 0" class="unread-dot">{{ unread > 99 ? '99+' : unread }}</span></button><span class="h-5 w-px bg-line" /><span class="rounded-md bg-brand-soft px-2 py-1 text-[11px] font-medium text-brand">管理员</span></div></header>
      <main id="admin-content" class="admin-main" tabindex="-1"><router-view /></main>
      <footer class="admin-page-footer"><span>课后服务 · 学校管理工作台</span><span>把日常工作，安排得更从容</span></footer>
    </div>
  </div>
</template>
<style scoped>
.admin-shell{display:flex;min-height:100vh}.admin-sidebar{position:sticky;top:0;display:flex;flex-direction:column;width:242px;height:100vh;flex-shrink:0;border-right:1px solid var(--color-line);background:#fff;z-index:40}.app-brand{display:flex;align-items:center;gap:11px;padding:27px 22px 24px;text-decoration:none;color:var(--color-ink);font-size:18px;font-weight:700;letter-spacing:.3px}.brand-mark{display:flex;width:38px;height:40px;align-items:center;justify-content:center;border-radius:12px 12px 12px 4px;background:var(--color-brand);color:white;box-shadow:0 4px 12px #3156d320}.brand-caption{display:block;margin-top:3px;font-size:10px;font-weight:400;color:var(--color-ink-3);letter-spacing:0}.school-context{display:flex;align-items:center;gap:10px;margin:0 16px 17px;padding:13px 12px;border:1px solid var(--color-line);border-radius:12px;background:#fbfcfe;font-size:12px}.school-context-icon{color:#7385ae}.admin-nav{flex:1;overflow-y:auto;padding:0 12px 20px}.admin-nav-group{margin-bottom:16px}.admin-nav-label{padding:7px 13px;font-size:11px;font-weight:500;color:#8792a5;letter-spacing:1px}.admin-nav-link{position:relative;display:flex;align-items:center;gap:12px;margin:3px 0;padding:10px 14px;border-radius:10px;font-size:13px;color:var(--color-ink-2);text-decoration:none;transition:background .15s,color .15s}.admin-nav-link:hover{background:#f7f8fc;color:var(--color-brand)}.admin-nav-link.is-active{background:var(--color-brand-soft);color:var(--color-brand);font-weight:600}.nav-active-dot{width:5px;height:5px;border-radius:50%;background:var(--color-brand);margin-left:auto}.admin-sidebar-footer{display:flex;align-items:center;gap:10px;margin:0 16px;padding:18px 0;border-top:1px solid var(--color-line)}.user-avatar{display:flex;width:35px;height:35px;align-items:center;justify-content:center;border-radius:11px;background:#eef1f8;font-size:13px;font-weight:600;color:#647299}.admin-body{display:flex;flex:1;min-width:0;flex-direction:column}.admin-header{height:74px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;border-bottom:1px solid var(--color-line);background:#ffffffd9}.admin-main{flex:1;min-width:0;max-width:1680px;width:100%;margin:0 auto;padding:30px 36px 38px;outline:none}.admin-page-footer{display:flex;justify-content:space-between;gap:16px;margin:0 36px;padding:20px 0 22px;border-top:1px solid var(--color-line);font-size:11px;color:#8a95a6}.admin-menu-toggle{display:none}.admin-sidebar-backdrop{position:fixed;inset:0;z-index:35;background:#18223f40;backdrop-filter:blur(2px)}
@media(max-width:1100px){.admin-sidebar{width:222px}.admin-main{padding:26px 24px}.admin-header{padding:0 24px}.admin-page-footer{margin:0 24px}}
@media(max-width:850px){.admin-sidebar{position:fixed;left:0;top:0;width:242px;visibility:hidden;transform:translateX(-100%);transition:transform .2s,visibility .2s}.admin-sidebar.is-open{visibility:visible;transform:translateX(0)}.admin-menu-toggle{display:flex}.admin-header{height:64px;padding:0 18px}.admin-main{padding:24px 16px}.admin-page-footer{margin:0 16px}.admin-page-footer span:last-child{display:none}}
</style>
