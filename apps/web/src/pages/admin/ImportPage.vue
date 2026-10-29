<script setup lang="ts">
import { computed, ref } from 'vue';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';
import AppIcon from '../../ui/AppIcon.vue';

const type = ref<'students' | 'teachers' | 'classes'>('students');
const text = ref('');
const fileRows = ref<string[][] | null>(null);
const fileName = ref('');
const result = ref<{ total: number; ok: number; failed: number; accounts: number; results: any[] } | null>(null);
const loading = ref(false);

const specs = {
  students: {
    label: '学生',
    header: '学号,姓名,班级,监护人姓名,监护人手机号',
    sample: '2026001,张小明,1班,张女士,13700000001\n2026002,李小雨,1班,李先生,13700000002',
    map: (c: string[]) => ({ code: c[0], name: c[1], className: c[2], guardianName: c[3], guardianPhone: c[4] }),
  },
  teachers: {
    label: '教师',
    header: '姓名,手机号',
    sample: '王老师,13900000001\n李老师,13900000002',
    map: (c: string[]) => ({ name: c[0], phone: c[1] }),
  },
  classes: {
    label: '班级',
    header: '年级,班级',
    sample: '三年级,1班\n三年级,2班',
    map: (c: string[]) => ({ grade: c[0], name: c[1] }),
  },
} as const;

const spec = computed(() => specs[type.value]);

const rawRows = computed<string[][]>(() => {
  if (fileRows.value) return fileRows.value;
  const lines = text.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => l.split(',').map((x) => x.trim()));
});

const rows = computed(() => {
  const all = rawRows.value;
  if (!all.length) return [];
  const first = (all[0][0] || '').trim();
  const hasHeader = ['学号', '姓名', '年级'].includes(first);
  return (hasHeader ? all.slice(1) : all).filter((r) => r.some((x) => String(x).trim())).map((r) => spec.value.map(r.map((x) => String(x ?? '').trim())));
});

function reset() {
  result.value = null;
  fileRows.value = null;
  fileName.value = '';
}

function useSample() {
  reset();
  text.value = spec.value.header + '\n' + spec.value.sample;
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    if (f.name.toLowerCase().endsWith('.csv')) {
      text.value = await f.text();
      fileRows.value = null;
    } else {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: '' });
      fileRows.value = arr.map((r) => r.map((c) => String(c ?? '').trim()));
      text.value = '';
    }
    fileName.value = f.name;
    result.value = null;
    toast(`已读取 ${f.name}，共 ${rows.value.length} 行`, 'success');
  } catch (err: any) {
    toast('解析失败：' + (err.message || '文件格式不支持'), 'error');
  }
}

async function submit() {
  if (!rows.value.length) return toast('没有可导入的数据', 'error');
  loading.value = true;
  try {
    result.value = await api.post(`/api/admin/import/${type.value}`, { rows: rows.value });
    const extra = result.value!.accounts ? `，新建家长账号 ${result.value!.accounts} 个（默认密码 123456）` : '';
    toast(`导入完成：成功 ${result.value!.ok}，失败 ${result.value!.failed}${extra}`, result.value!.failed ? 'info' : 'success');
  } catch (e: any) {
    toast(e.message, 'error');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="page-heading"><div><div class="eyebrow">开课前的准备</div><h1 class="page-title">批量导入资料</h1><p class="page-description">准备好班级、教师与学生信息，通过文件或粘贴快速录入。</p></div></div>
    <div class="mb-5 grid gap-3 sm:grid-cols-3"><div class="flex items-center gap-3 rounded-xl border border-line bg-white p-4"><span class="icon-tile icon-tile-blue"><AppIcon name="list" :size="18" /></span><div><div class="text-[13px] font-medium">1. 选择资料类型</div><div class="text-[12px] text-ink-3">建议先班级，再教师与学生</div></div></div><div class="flex items-center gap-3 rounded-xl border border-line bg-white p-4"><span class="icon-tile icon-tile-mint"><AppIcon name="upload" :size="18" /></span><div><div class="text-[13px] font-medium">2. 上传并查看预览</div><div class="text-[12px] text-ink-3">此时尚未写入系统</div></div></div><div class="flex items-center gap-3 rounded-xl border border-line bg-white p-4"><span class="icon-tile icon-tile-amber"><AppIcon name="check-circle" :size="18" /></span><div><div class="text-[13px] font-medium">3. 导入并核对结果</div><div class="text-[12px] text-ink-3">按提示修正失败行</div></div></div></div>

    <div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="card min-w-0 p-5">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button v-for="(v, k) in specs" :key="k" class="btn btn-sm" :class="type === k ? 'btn-primary' : 'btn-secondary'" @click="type = k as any; reset(); text = ''">
            {{ v.label }}
          </button>
          <button class="btn btn-ghost btn-sm ml-auto" @click="useSample">填入示例</button>
        </div>

        <label
          class="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-[#fafbfc] py-6 text-center hover:border-brand"
        >
          <span class="icon-tile icon-tile-blue mb-3"><AppIcon name="upload" :size="23" /></span><div class="text-[14px] font-medium text-ink">点击上传 Excel / CSV 文件</div>
          <div class="mt-1 text-[12px] text-ink-3">支持 .xlsx、.xls、.csv，取第一个工作表</div>
          <div v-if="fileName" class="mt-2 text-[12px] text-brand">已选择：{{ fileName }}</div>
          <input type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="onFile" />
        </label>

        <div class="mb-2 text-[12px] text-ink-3">或者直接粘贴（表头：{{ spec.header }}）</div>
        <textarea
          v-model="text"
          class="input h-[180px] resize-none py-2 font-mono text-[13px]"
          placeholder="从 Excel 复制 → 粘贴到这里"
          @input="fileRows = null; fileName = ''; result = null"
        />

        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button class="btn btn-primary" :disabled="loading || !rows.length" @click="submit">
            {{ loading ? '导入中…' : `导入 ${rows.length} 行` }}
          </button>
          <span class="text-[13px] text-ink-3">重复数据自动跳过；有手机号会自动开通家长账号</span>
        </div>
      </div>

      <div class="card">
        <div class="border-b border-line px-5 py-4"><h2 class="section-title">导入结果</h2><p class="section-subtitle">提交后查看成功与失败情况</p></div>
        <div class="p-4">
          <div v-if="!result" class="py-10 text-center text-[13px] text-ink-3">还没有导入记录</div>
          <template v-else>
            <div class="mb-2 flex gap-4 text-[13px]">
              <span>共 {{ result.total }}</span>
              <span class="text-ok">成功 {{ result.ok }}</span>
              <span class="text-danger">失败 {{ result.failed }}</span>
            </div>
            <div v-if="result.accounts" class="mb-2 rounded-md bg-brand-soft p-2 text-[12px] text-brand">
              新建家长账号 {{ result.accounts }} 个，默认密码 123456
            </div>
            <div class="max-h-[300px] overflow-auto">
              <div v-for="r in result.results.filter((x: any) => !x.ok)" :key="r.row" class="border-b border-[#f2f3f5] py-1.5 text-[12px]">
                <span class="text-danger">第 {{ r.row }} 行</span>
                <span class="ml-2 text-ink-2">{{ r.message }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="card mt-4 card-pad">
      <div class="mb-3"><h2 class="section-title">内容预览 <span class="text-[12px] font-normal text-ink-3">前 10 行</span></h2><p class="section-subtitle">请核对字段顺序，确认后点击导入。</p></div>
      <div class="overflow-x-auto"><table class="table-base min-w-[500px]">
        <tbody>
          <tr v-for="(r, i) in rows.slice(0, 10)" :key="i">
            <td class="w-10 text-ink-3">{{ i + 1 }}</td>
            <td>{{ Object.values(r).filter(Boolean).join(' / ') }}</td>
          </tr>
          <tr v-if="!rows.length"><td class="py-6 text-center text-ink-3">上传文件或粘贴数据后这里会显示预览</td></tr>
        </tbody>
      </table></div>
    </div>
  </div>
</template>
