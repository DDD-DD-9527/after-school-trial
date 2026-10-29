import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { state, loadMe, homeOf } from './lib/auth';
import { session, SessionChangedError } from './lib/session';

const routes: RouteRecordRaw[] = [
  { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
  { path: '/change-password', component: () => import('./pages/ChangePasswordPage.vue'), meta: { public: true } },
  { path: '/', redirect: '/login' },

  {
    path: '/ops',
    component: () => import('./layouts/OperationsLayout.vue'),
    meta: { role: 'operator' },
    children: [
      { path: '', component: () => import('./pages/ops/DashboardPage.vue') },
      { path: 'schools', component: () => import('./pages/ops/SchoolsPage.vue') },
      { path: 'schools/:id', component: () => import('./pages/ops/SchoolDetailPage.vue') },
    ],
  },

  {
    path: '/admin',
    component: () => import('./layouts/AdminLayout.vue'),
    meta: { role: 'admin' },
    children: [
      { path: '', component: () => import('./pages/admin/DashboardPage.vue') },
      { path: 'import', component: () => import('./pages/admin/ImportPage.vue') },
      { path: 'classes', component: () => import('./pages/admin/ClassesPage.vue') },
      { path: 'students', component: () => import('./pages/admin/StudentsPage.vue') },
      { path: 'teachers', component: () => import('./pages/admin/TeachersPage.vue') },
      { path: 'courses', component: () => import('./pages/admin/CoursesPage.vue') },
      { path: 'courses/:id', component: () => import('./pages/admin/CourseDetailPage.vue') },
      { path: 'schedule', component: () => import('./pages/admin/SchedulePage.vue') },
      { path: 'plans', component: () => import('./pages/admin/PlansPage.vue') },
      { path: 'plans/:id', component: () => import('./pages/admin/PlanDetailPage.vue') },
      { path: 'attendance', component: () => import('./pages/admin/AttendancePage.vue') },
      { path: 'teacher-attendance', component: () => import('./pages/admin/TeacherAttendancePage.vue') },
      { path: 'messages', component: () => import('./pages/MessagesPage.vue') },
      { path: 'finance', component: () => import('./pages/admin/FinancePage.vue') },
    ],
  },

  {
    path: '/teacher',
    component: () => import('./layouts/MobileLayout.vue'),
    meta: { role: 'teacher' },
    children: [
      { path: '', component: () => import('./pages/teacher/TodayPage.vue') },
      { path: 'attendance', component: () => import('./pages/teacher/AttendancePage.vue') },
      { path: 'sessions/:id', component: () => import('./pages/teacher/SessionPage.vue') },
      { path: 'messages', component: () => import('./pages/MessagesPage.vue') },
    ],
  },

  {
    path: '/parent',
    component: () => import('./layouts/MobileLayout.vue'),
    meta: { role: 'parent' },
    children: [
      { path: '', component: () => import('./pages/parent/HomePage.vue') },
      { path: 'enroll', component: () => import('./pages/parent/EnrollPage.vue') },
      { path: 'course/:id', component: () => import('./pages/parent/CoursePage.vue') },
      { path: 'enrollments', component: () => import('./pages/parent/EnrollmentsPage.vue') },
      { path: 'schedule', component: () => import('./pages/parent/SchedulePage.vue') },
      { path: 'messages', component: () => import('./pages/MessagesPage.vue') },
    ],
  },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  let token: string | null;
  try { token = session.token(); } catch (error) { if (error instanceof SessionChangedError) return false; throw error; }
  if (!token) return to.path === '/change-password' || !to.meta.public ? '/login' : true;
  if (!state.me) {
    try { const me = await loadMe(); if (!me) return '/login'; }
    catch (error) { if (error instanceof SessionChangedError) return false; session.setToken(null); state.me = null; return to.path === '/login' ? true : '/login'; }
  }
  if (state.me!.mustChangePassword && to.path !== '/change-password') return '/change-password';
  if (!state.me!.mustChangePassword && to.path === '/change-password') return homeOf(state.me!.role);
  if (to.path === '/login') return homeOf(state.me!.role);
  if (to.meta.public) return true;
  const need = to.matched.find((r) => r.meta.role)?.meta.role as string | undefined;
  if (need && state.me!.role !== need) return homeOf(state.me!.role);
  return true;
});
