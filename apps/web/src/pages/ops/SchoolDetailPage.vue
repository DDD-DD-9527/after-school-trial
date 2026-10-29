<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { operations, errorText, money, dateTime, validPhone, eventLabel, type SchoolDetail, type SchoolAdmin } from '../../lib/operations';
import { toast } from '../../lib/toast';
import AppIcon from '../../ui/AppIcon.vue';
import Modal from '../../ui/Modal.vue';
const route = useRoute();
const data = ref<SchoolDetail | null>(null);
const loading = ref(false);
const error = ref('');
const tab = ref('settings');
const saving = ref(false);
const formError = ref('');
const form = reactive({ name: '', term: '', contactName: '', contactPhone: '' });
const adminDialog = ref(false);
const editingAdmin = ref<SchoolAdmin | null>(null);
const adminForm = reactive({ name: '', phone: '', password: '' });
const adminError = ref('');
const adminSaving = ref(false);
const showPassword = ref(false);
const confirmation = ref<{ kind: 'school' } | { kind: 'admin'; admin: SchoolAdmin } | null>(null);
const confirmError = ref('');
const confirming = ref(false);
let requestId = 0;
let mutationEpoch = 0;
function mutationContext() {
  const schoolId = data.value?.school.id;
  const routeId = String(route.params.id);
  if (!schoolId || routeId !== String(schoolId)) return null;
  return { schoolId, routeId, requestId, epoch: mutationEpoch };
}
type MutationContext = NonNullable<ReturnType<typeof mutationContext>>;
const samePage = (context: MutationContext) => context.epoch === mutationEpoch && context.routeId === String(route.params.id);
const currentMutation = (context: MutationContext) => samePage(context) && context.requestId === requestId && context.schoolId === data.value?.school.id;
const activeAdmins = computed(() => data.value?.admins.filter(admin => admin.status === 'active').length ?? 0);
const lastAdmin = (admin: SchoolAdmin) => data.value?.school.status === 'active' && admin.status === 'active' && activeAdmins.value <= 1;
const stats = computed(() => [
  { label: '学生档案', value: data.value?.stats.students, unit: '人', icon: 'users', color: 'blue' },
  { label: '教师档案', value: data.value?.stats.teachers, unit: '人', icon: 'user', color: 'mint' },
  { label: '开设课程', value: data.value?.stats.courses, unit: '门', icon: 'book', color: 'amber' },
  { label: '业务待收', value: data.value ? money(data.value.stats.outstanding) : '—', unit: '', icon: 'wallet', color: 'rose' },
]);
const tabs = computed(() => [{ id: 'settings', label: '学校设置', icon: 'school' }, { id: 'admins', label: `管理员账号${data.value ? ` · ${data.value.admins.length}` : ''}`, icon: 'shield' }, { id: 'events', label: '操作记录', icon: 'clock' }]);
const confirmTitle = computed(() => confirmation.value?.kind === 'school' ? `${data.value?.school.status === 'active' ? '停用' : '恢复'}学校服务` : `${confirmation.value?.kind === 'admin' && confirmation.value.admin.status === 'active' ? '停用' : '启用'}管理员账号`);
const isDanger = computed(() => confirmation.value?.kind === 'school' ? data.value?.school.status === 'active' : confirmation.value?.kind === 'admin' && confirmation.value.admin.status === 'active');
async function load() {
  const id = ++requestId;
  loading.value = true; error.value = ''; formError.value = '';
  try { const result = await operations.detail(String(route.params.id)); if (id !== requestId) return; data.value = result; Object.assign(form, { name: result.school.name, term: result.school.term, contactName: result.school.contactName || '', contactPhone: result.school.contactPhone || '' }); }
  catch (e) { if (id === requestId) { data.value = null; error.value = errorText(e, '学校信息暂时无法加载'); } }
  finally { if (id === requestId) loading.value = false; }
}
async function saveSettings() {
  if (saving.value || !data.value) return;
  const context = mutationContext();
  if (!context) return;
  formError.value = '';
  const body = { name: form.name.trim(), term: form.term.trim(), contactName: form.contactName.trim(), contactPhone: form.contactPhone.trim(), status: data.value.school.status };
  if (!body.name || !body.term) { formError.value = '请填写学校名称和当前学期'; return; }
  if (body.contactPhone && !validPhone(body.contactPhone)) { formError.value = '联系人手机号应为 11 位手机号'; return; }
  saving.value = true;
  try { await operations.update(context.schoolId, body); if (!currentMutation(context)) return; toast('学校设置已保存', 'success'); await load(); }
  catch (e) { if (currentMutation(context)) formError.value = errorText(e, '学校设置保存失败'); }
  finally { if (samePage(context)) saving.value = false; }
}
function openAdmin(admin?: SchoolAdmin) { editingAdmin.value = admin || null; Object.assign(adminForm, { name: admin?.name || '', phone: admin?.phone || '', password: '' }); adminError.value = ''; showPassword.value = false; adminDialog.value = true; }
function closeAdmin() { if (!adminSaving.value) { adminDialog.value = false; adminForm.password = ''; } }
async function saveAdmin() {
  if (adminSaving.value || !data.value) return;
  const context = mutationContext();
  if (!context) return;
  const admin = editingAdmin.value ? { ...editingAdmin.value } : null;
  adminError.value = '';
  const name = adminForm.name.trim(), phone = adminForm.phone.trim();
  if (!name) { adminError.value = '请输入管理员姓名'; return; }
  if (!editingAdmin.value && !validPhone(phone)) { adminError.value = '请输入正确的 11 位手机号'; return; }
  if (!editingAdmin.value && adminForm.password.length < 6) { adminError.value = '初始密码至少 6 位'; return; }
  adminSaving.value = true;
  try {
    if (admin) await operations.updateAdmin(context.schoolId, { ...admin, name });
    else await operations.createAdmin(context.schoolId, { name, phone, password: adminForm.password });
    if (!currentMutation(context)) return;
    adminDialog.value = false; adminForm.password = ''; toast(admin ? '管理员信息已保存' : '管理员已创建，请安全交付初始密码', 'success'); await load();
  } catch (e) { if (currentMutation(context)) adminError.value = errorText(e, '管理员账号保存失败'); }
  finally { if (samePage(context)) adminSaving.value = false; }
}
function requestStatus(admin?: SchoolAdmin) { if (admin && lastAdmin(admin)) return; confirmError.value = ''; confirmation.value = admin ? { kind: 'admin', admin } : { kind: 'school' }; }
function closeConfirm() { if (!confirming.value) confirmation.value = null; }
async function confirmStatus() {
  if (confirming.value || !data.value || !confirmation.value) return;
  const context = mutationContext();
  if (!context) return;
  const target = confirmation.value;
  const school = { ...data.value.school };
  confirming.value = true; confirmError.value = '';
  try {
    if (target.kind === 'school') {
      await operations.update(school.id, { name: school.name, term: school.term, contactName: school.contactName || '', contactPhone: school.contactPhone || '', status: school.status === 'active' ? 'inactive' : 'active' });
    } else { const admin = target.admin; await operations.updateAdmin(context.schoolId, { ...admin, status: admin.status === 'active' ? 'inactive' : 'active' }); }
    if (!currentMutation(context)) return;
    toast('服务状态已更新', 'success'); confirmation.value = null; await load();
  } catch (e) { if (currentMutation(context)) confirmError.value = errorText(e, '状态更新失败，请重试'); }
  finally { if (samePage(context)) confirming.value = false; }
}
watch(() => route.params.id, () => {
  mutationEpoch++;
  saving.value = false; adminSaving.value = false; confirming.value = false;
  formError.value = ''; adminError.value = ''; confirmError.value = '';
  data.value = null; tab.value = 'settings'; confirmation.value = null; adminDialog.value = false; editingAdmin.value = null;
  Object.assign(adminForm, { name: '', phone: '', password: '' });
  load();
}, { immediate: true });
</script>
<template>
  <div>
    <router-link to="/ops/schools" class="back-link"><AppIcon name="arrow-left" :size="16" />返回学校管理</router-link>
    <div v-if="error" class="card detail-state" role="alert"><span class="icon-tile icon-tile-rose"><AppIcon name="alert" :size="25" /></span><h1>学校信息暂时无法加载</h1><p>{{ error }}</p><button class="btn btn-secondary mt-4" @click="load">重新加载</button></div>
    <div v-else-if="loading && !data" class="card detail-state" role="status"><AppIcon class="text-brand" name="school" :size="32" /><p>正在读取学校信息…</p></div>
    <template v-else-if="data">
      <div class="page-heading"><div class="school-heading"><span class="detail-school-icon">{{ data.school.name.slice(0, 1) }}</span><div><div class="flex flex-wrap items-center gap-3"><h1 class="page-title">{{ data.school.name }}</h1><span class="badge" :class="data.school.status === 'active' ? 'badge-green' : 'badge-gray'">{{ data.school.status === 'active' ? '服务中' : '已停用' }}</span></div><p class="page-description">{{ data.school.code }}<span class="mx-2 text-[#c0c9d9]">/</span>{{ data.school.term }}<span class="hidden sm:inline"><span class="mx-2 text-[#c0c9d9]">/</span>{{ dateTime(data.school.createdAt) }} 开通</span></p></div></div><button class="btn btn-secondary" :disabled="loading || saving || confirming || adminSaving" @click="load"><AppIcon name="refresh" :size="16" />{{ loading ? '更新中' : '刷新' }}</button></div>
      <div v-if="data.school.status === 'inactive'" class="inactive-notice"><AppIcon name="info" :size="18" /><p>学校服务已停用，全部资料和账单保留。该校管理员、教师与家长暂时无法登录或访问学校业务。</p></div>
      <div class="detail-metrics"><section v-for="stat in stats" :key="stat.label" class="metric-card"><span class="metric-icon" :class="`icon-tile-${stat.color}`"><AppIcon :name="stat.icon" :size="18" /></span><div><p>{{ stat.label }}</p><strong>{{ stat.value }}<small>{{ stat.unit }}</small></strong></div></section></div>
      <section class="card"><nav class="detail-tabs" aria-label="学校详情栏目"><button v-for="item in tabs" :key="item.id" :class="{ selected: tab === item.id }" :aria-current="tab === item.id ? 'page' : undefined" @click="tab = item.id"><AppIcon :name="item.icon" :size="17" />{{ item.label }}</button></nav>
        <div v-if="tab === 'settings'" class="settings-content"><form class="school-settings" @submit.prevent="saveSettings"><div class="settings-heading"><h2>学校基础信息</h2><p>学校名称与学期会显示在学校成员的工作空间。</p></div><fieldset :disabled="saving || loading || confirming"><div class="settings-grid"><div class="field"><label class="label" for="detail-school-name">学校名称 <span>*</span></label><input id="detail-school-name" v-model="form.name" class="input" maxlength="80" required /></div><div class="field"><label class="label" for="detail-school-code">学校编码</label><input id="detail-school-code" :value="data.school.code" class="input locked-input" disabled /><p class="field-hint">学校编码创建后不可更改</p></div><div class="field"><label class="label" for="detail-school-term">当前学期 <span>*</span></label><input id="detail-school-term" v-model="form.term" class="input" maxlength="40" required /></div><div class="field"><label class="label" for="detail-school-contact">学校联系人</label><input id="detail-school-contact" v-model="form.contactName" class="input" maxlength="40" placeholder="选填" /></div><div class="field"><label class="label" for="detail-school-phone">联系人手机号</label><input id="detail-school-phone" v-model="form.contactPhone" class="input" type="tel" inputmode="tel" maxlength="11" placeholder="选填" /></div></div></fieldset><p v-if="formError" class="feedback-error" role="alert">{{ formError }}</p><div class="settings-submit"><span>学校业务数据由学校管理员维护</span><button class="btn btn-primary" type="submit" :disabled="saving || loading || confirming">{{ saving ? '保存中…' : '保存学校设置' }}</button></div></form><aside class="service-settings"><span class="icon-tile" :class="data.school.status === 'active' ? 'icon-tile-mint' : 'icon-tile-amber'"><AppIcon name="shield" :size="25" /></span><h3>学校服务状态</h3><span class="badge mt-3" :class="data.school.status === 'active' ? 'badge-green' : 'badge-gray'">{{ data.school.status === 'active' ? '服务中' : '已停用' }}</span><p>{{ data.school.status === 'active' ? '学校成员可以使用本校服务。停用后，所有学校成员将暂停登录和业务访问，资料及账单继续保留。' : '恢复后，学校成员可继续使用原有账号和业务资料。请先确认学校已有可用管理员。' }}</p><button class="btn btn-secondary btn-sm" :class="{ 'text-danger': data.school.status === 'active' }" :disabled="saving || loading || confirming || adminSaving" @click="requestStatus()">{{ data.school.status === 'active' ? '停用学校服务' : '恢复学校服务' }}</button></aside></div>
        <div v-else-if="tab === 'admins'"><div class="section-heading border-b-0"><div><h2 class="section-title">学校管理员</h2><p class="section-subtitle">{{ activeAdmins }} 个有效账号 · 管理员负责本校全部课后服务业务</p></div><button class="btn btn-primary btn-sm" :disabled="loading || confirming" @click="openAdmin()"><AppIcon name="plus" :size="16" />新增管理员</button></div><div v-if="!data.admins.length" class="detail-state"><span class="icon-tile icon-tile-blue"><AppIcon name="shield" :size="24" /></span><h3>学校还没有管理员</h3><p>创建管理员并安全交付初始密码，完成学校工作交接。</p><button class="btn btn-secondary mt-4" @click="openAdmin()">创建管理员</button></div><div v-else class="admin-list"><article v-for="admin in data.admins" :key="admin.id" class="admin-row"><span class="admin-avatar">{{ admin.name.slice(0, 1) }}</span><div class="admin-identity"><strong>{{ admin.name }}<span class="badge" :class="admin.status === 'active' ? 'badge-green' : 'badge-gray'">{{ admin.status === 'active' ? '正常' : '已停用' }}</span></strong><p>{{ admin.phone }}<span>·</span>{{ dateTime(admin.createdAt) }} 创建</p><small v-if="lastAdmin(admin)">学校服务中，至少保留一位有效管理员</small></div><div class="admin-actions"><button class="btn btn-ghost btn-sm" :disabled="loading || confirming" @click="openAdmin(admin)"><AppIcon name="edit" :size="15" />编辑</button><button class="btn btn-secondary btn-sm" :class="admin.status === 'active' ? 'text-danger' : 'text-brand'" :disabled="loading || confirming || lastAdmin(admin)" :title="lastAdmin(admin) ? '请先新增另一位有效管理员' : undefined" @click="requestStatus(admin)">{{ admin.status === 'active' ? '停用' : '启用' }}</button></div></article></div><div class="admin-footnote"><AppIcon name="info" :size="15" /><span>新管理员首次登录须修改初始密码。停用账号会立即暂停该账号访问，业务记录保留。</span></div></div>
        <div v-else><div class="section-heading"><div><h2 class="section-title">最近操作记录</h2><p class="section-subtitle">学校开通、设置与管理员变更 · 北京时间</p></div></div><div v-if="!data.recentEvents.length" class="detail-state"><AppIcon class="text-ink-3" name="clock" :size="30" /><h3>暂无操作记录</h3><p>后续学校设置和账号操作会记录在这里。</p></div><ol v-else class="event-list"><li v-for="event in data.recentEvents" :key="event.id"><span class="event-dot"><AppIcon name="check" :size="12" /></span><div><strong>{{ eventLabel(event.action) }}</strong><p>{{ event.detail }}</p><small>{{ event.actorName || '运营管理员' }}<span>·</span>{{ dateTime(event.createdAt, true) }}</small></div></li></ol></div>
      </section>
    </template>
    <Modal :show="adminDialog" :title="editingAdmin ? '编辑管理员' : '新增学校管理员'" width="460px" @close="closeAdmin"><form id="school-admin-form" @submit.prevent="saveAdmin"><p class="dialog-intro">{{ editingAdmin ? '更新管理员姓名，登录手机号保持不变。' : `为${data?.school.name || '学校'}创建独立管理员账号，首次登录须修改密码。` }}</p><fieldset :disabled="adminSaving"><div class="field"><label class="label" for="new-admin-name">管理员姓名 <span class="text-danger">*</span></label><input id="new-admin-name" v-model="adminForm.name" class="input" maxlength="40" required /></div><div class="field"><label class="label" for="new-admin-phone">登录手机号 <span v-if="!editingAdmin" class="text-danger">*</span></label><input id="new-admin-phone" v-model="adminForm.phone" class="input" :class="{ 'locked-input': editingAdmin }" type="tel" inputmode="tel" maxlength="11" :disabled="!!editingAdmin" autocomplete="off" required /></div><div v-if="!editingAdmin" class="field"><label class="label" for="new-admin-password">初始密码 <span class="text-danger">*</span></label><div class="relative"><input id="new-admin-password" v-model="adminForm.password" class="input pr-12" :type="showPassword ? 'text' : 'password'" minlength="6" maxlength="128" placeholder="至少 6 位，线下安全交付" autocomplete="new-password" required /><button class="icon-button absolute right-1 top-0.5" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="17" /></button></div></div></fieldset><p v-if="adminError" class="feedback-error" role="alert">{{ adminError }}</p></form><template #footer><button class="btn btn-secondary" :disabled="adminSaving" @click="closeAdmin">取消</button><button class="btn btn-primary" type="submit" form="school-admin-form" :disabled="adminSaving">{{ adminSaving ? '保存中…' : editingAdmin ? '保存修改' : '创建管理员' }}</button></template></Modal>
    <Modal :show="!!confirmation" :title="confirmTitle" width="460px" @close="closeConfirm"><div class="confirm-intro"><span class="icon-tile" :class="isDanger ? 'icon-tile-amber' : 'icon-tile-mint'"><AppIcon :name="isDanger ? 'alert' : 'shield'" :size="24" /></span><div v-if="confirmation?.kind === 'school'"><h3>{{ data?.school.name }}</h3><p v-if="isDanger">停用后，该校管理员、教师和家长将无法登录，已登录成员也将暂停业务访问。学校全部资料和账单保留，后续可恢复服务。</p><p v-else>恢复后，该校成员可继续登录并访问本校服务。已有师生、课程、报名及账单资料将继续保留。</p></div><div v-else-if="confirmation?.kind === 'admin'"><h3>{{ confirmation.admin.name }} · {{ confirmation.admin.phone }}</h3><p>{{ isDanger ? '停用后，该管理员将无法登录或继续访问学校业务。已有业务记录会保留，之后可以重新启用。' : '启用后，该管理员可以使用原有账号登录并管理本校业务。' }}</p></div></div><p v-if="confirmError" class="feedback-error" role="alert">{{ confirmError }}</p><template #footer><button class="btn btn-secondary" :disabled="confirming" @click="closeConfirm">取消</button><button class="btn" :class="isDanger ? 'btn-danger' : 'btn-primary'" :disabled="confirming" @click="confirmStatus">{{ confirming ? '处理中…' : `确认${isDanger ? '停用' : confirmation?.kind === 'school' ? '恢复' : '启用'}` }}</button></template></Modal>
  </div>
</template>
<style scoped>
.back-link{display:inline-flex;align-items:center;gap:7px;margin-bottom:22px;font-size:12px;text-decoration:none;color:var(--color-ink-3)}.back-link:hover{color:var(--color-brand)}.school-heading{display:flex;align-items:center;gap:16px}.detail-school-icon{display:grid;place-items:center;width:58px;height:60px;flex-shrink:0;border:1px solid #dce4f7;border-radius:17px;background:#edf2ff;font-size:24px;font-weight:600;color:#5973b8}.detail-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:25px}.detail-metrics .metric-card{display:flex;align-items:center;gap:15px;padding:21px}.metric-icon{display:grid;place-items:center;flex-shrink:0;width:39px;height:41px;border-radius:12px}.metric-card p{font-size:11px;color:var(--color-ink-3)}.metric-card strong{display:block;margin-top:6px;font-size:23px;font-weight:650;line-height:1.3;font-variant-numeric:tabular-nums;letter-spacing:-.5px;overflow-wrap:anywhere}.metric-card small{margin-left:5px;font-size:10px;font-weight:400;color:var(--color-ink-3)}.detail-metrics .metric-card:last-child strong{font-size:20px}.inactive-notice{display:flex;align-items:flex-start;gap:9px;margin-bottom:21px;padding:13px 16px;border:1px solid #efdfc5;border-radius:12px;background:#fff8eb;color:#9a763d;font-size:12px;line-height:1.9}.inactive-notice>svg{margin-top:2px}.detail-tabs{display:flex;gap:21px;padding:0 25px;border-bottom:1px solid var(--color-line);overflow-x:auto}.detail-tabs button{display:flex;align-items:center;gap:8px;min-height:58px;flex-shrink:0;padding:0 3px;border-bottom:2px solid transparent;font-size:13px;color:var(--color-ink-3)}.detail-tabs button.selected{border-color:var(--color-brand);color:var(--color-brand);font-weight:600}.settings-content{display:grid;grid-template-columns:minmax(0,1fr) 280px}.school-settings{padding:27px 28px}.settings-heading h2{font-size:15px;font-weight:600}.settings-heading p{margin-top:5px;font-size:11px;color:var(--color-ink-3)}.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 20px;margin-top:25px}.settings-grid .label{font-size:12px}.label>span{color:var(--color-danger)}.locked-input{background:#f6f7fa;color:var(--color-ink-3)}.field-hint{margin-top:6px;font-size:10px;color:var(--color-ink-3)}.settings-submit{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:12px;padding-top:22px;border-top:1px solid var(--color-line)}.settings-submit>span{font-size:10px;color:var(--color-ink-3)}.service-settings{margin:27px 0;padding:0 25px;border-left:1px solid var(--color-line)}.service-settings h3{margin-top:16px;font-size:14px;font-weight:600}.service-settings p{margin:16px 0 22px;font-size:11px;line-height:2;color:var(--color-ink-3)}.admin-list{padding:0 25px}.admin-row{display:flex;align-items:center;gap:14px;padding:24px 0;border-top:1px solid var(--color-line)}.admin-row:first-child{border-top:0}.admin-avatar{display:grid;place-items:center;width:42px;height:44px;flex-shrink:0;border-radius:12px;background:#f0f3fb;color:#7c8eb5;font-size:17px;font-weight:600}.admin-identity{flex:1;min-width:0}.admin-identity strong{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:13px;font-weight:600}.admin-identity strong .badge{min-height:21px;font-size:10px}.admin-identity p{margin-top:6px;font-size:11px;color:var(--color-ink-3)}.admin-identity p>span{margin:0 8px;color:#b5bfd0}.admin-identity small{display:block;margin-top:6px;font-size:10px;color:#a48144}.admin-actions{display:flex;gap:7px}.admin-footnote{display:flex;align-items:flex-start;gap:8px;padding:17px 25px;border-top:1px solid var(--color-line);font-size:11px;line-height:1.8;color:var(--color-ink-3)}.admin-footnote>svg{margin-top:2px}.detail-state{display:flex;min-height:290px;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center}.detail-state h1,.detail-state h3{margin-top:15px;font-size:16px;font-weight:600}.detail-state p{margin-top:9px;font-size:12px;line-height:1.8;color:var(--color-ink-3)}.feedback-error{margin-top:12px;padding:10px 12px;border-radius:9px;background:#fff4f2;color:var(--color-danger);font-size:12px;line-height:1.8}.dialog-intro{margin:0 0 22px;font-size:12px;line-height:1.9;color:var(--color-ink-3)}.confirm-intro{display:flex;align-items:flex-start;gap:14px;padding:6px 0 9px}.confirm-intro h3{font-size:13px;font-weight:600}.confirm-intro p{margin-top:9px;color:var(--color-ink-2);font-size:12px;line-height:1.9}.event-list{padding:8px 28px 26px}.event-list li{position:relative;display:flex;align-items:flex-start;gap:15px;padding:22px 0 8px}.event-list li:not(:last-child)::before{content:'';position:absolute;left:12px;top:44px;bottom:-17px;width:1px;background:var(--color-line)}.event-dot{position:relative;display:grid;place-items:center;width:25px;height:25px;flex-shrink:0;border:4px solid #f3f6ff;border-radius:50%;background:#dbe5ff;color:#6b82ba}.event-list strong{font-size:13px;font-weight:600}.event-list p{margin-top:7px;font-size:12px;line-height:1.8;color:var(--color-ink-2)}.event-list small{display:block;margin-top:8px;font-size:10px;color:var(--color-ink-3)}.event-list small>span{margin:0 8px;color:#c1c9d7}@media(max-width:1250px){.detail-metrics{gap:12px}.detail-metrics .metric-card{padding:17px;gap:10px}.detail-metrics .metric-card:last-child strong{font-size:17px}.settings-content{grid-template-columns:minmax(0,1fr) 240px}.school-settings{padding:25px 22px}.service-settings{padding:0 20px}}@media(max-width:1050px){.detail-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.settings-content{grid-template-columns:1fr}.service-settings{margin:0 22px;padding:22px 0;border-left:0;border-top:1px solid var(--color-line)}.service-settings>.icon-tile{display:none}.service-settings h3{margin:0}.service-settings p{max-width:620px;margin:12px 0 17px}}@media(max-width:600px){.school-heading{gap:11px}.detail-school-icon{width:43px;height:46px;border-radius:13px;font-size:20px}.school-heading .page-title{font-size:21px}.school-heading .badge{font-size:10px}.school-heading .page-description{font-size:11px}.detail-metrics .metric-card{padding:16px;gap:10px}.metric-icon{width:31px;height:34px;border-radius:10px}.metric-card strong{font-size:23px}.detail-metrics .metric-card:last-child strong{font-size:17px}.detail-tabs{gap:18px;padding:0 18px}.detail-tabs button{font-size:12px}.detail-tabs svg{display:none}.school-settings{padding:22px 18px}.settings-grid{grid-template-columns:1fr;gap:0}.settings-submit{align-items:flex-start;flex-direction:column}.settings-submit>.btn{width:100%}.service-settings{margin:0 18px}.admin-list{padding:0 18px}.admin-row{gap:10px;flex-wrap:wrap;padding:21px 0}.admin-actions{width:100%;justify-content:flex-end}.admin-identity p{font-size:10px;line-height:1.8}.admin-identity p>span{margin:0 5px}.admin-footnote{padding:16px 18px;font-size:10px}.event-list{padding:5px 19px 25px}.confirm-intro .icon-tile{width:34px;height:36px;border-radius:10px}.detail-metrics .metric-card:last-child{align-items:flex-start}}
</style>
