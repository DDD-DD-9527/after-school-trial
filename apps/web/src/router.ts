import { createRouter, createWebHistory } from 'vue-router';
import { state, loadMe, homeOf } from './lib/auth';

const routes = [
  { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
  { path: '/change-password', component: () => import('./pages/ChangePasswordPage.vue'), meta: { public: true } },
  { path: '/', redirect: '/login' },

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
  const token = localStorage.getItem('token');

  if (to.meta.public) {
    if (token && state.me && to.path === '/login') return homeOf(state.me.role);
    return true;
  }
  if (!token) return '/login';
  if (!state.me) {
    const me = await loadMe();
    if (!me) return '/login';
  }
  if (state.me!.mustChangePassword && to.path !== '/change-password') return '/change-password';
  if (!state.me!.mustChangePassword && to.path === '/change-password') return homeOf(state.me!.role);
  const need = to.matched.find((r) => r.meta.role)?.meta.role as string | undefined;
  if (need && state.me!.role !== need) return homeOf(state.me!.role);
  return true;
});
