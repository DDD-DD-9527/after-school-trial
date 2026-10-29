// 并发占位测试：N 个家长同时抢 1 个名额，只能成功 1 个
const API = 'http://localhost:5281';

async function login(phone, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('login failed: ' + JSON.stringify(data));
  return data.token;
}

async function enroll(token, planCourseId, studentId) {
  const res = await fetch(`${API}/api/parent/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planCourseId, studentId }),
  });
  const data = await res.json();
  return { status: res.status, code: data.code ?? 'OK', message: data.message };
}

const planCourseId = Number(process.argv[2]);
const n = Number(process.argv[3] || 12);

const tokens = [];
for (let i = 1; i <= n; i++) {
  const phone = `137000000${String(i).padStart(2, '0')}`;
  tokens.push(await login(phone, '123456'));
}

const results = await Promise.all(tokens.map((t, i) => enroll(t, planCourseId, i + 1)));
const ok = results.filter((r) => r.status === 200).length;
const full = results.filter((r) => r.code === 'FULL').length;
const other = results.filter((r) => r.status !== 200 && r.code !== 'FULL');

console.log(`并发 ${n} 人抢 1 个名额`);
console.log(`成功 ${ok} · 名额已满 ${full} · 其他 ${other.length}`);
if (other.length) console.log(other);

const adminToken = await login('13800000000', 'admin123');
const res = await fetch(`${API}/api/admin/plans`, { headers: { Authorization: `Bearer ${adminToken}` } });
const plans = await res.json();
const target = plans.find((p) => p.name === '压测计划');
const pc = target?.courses.find((c) => c.id === planCourseId);
console.log(`数据库计数 enrolled=${pc?.enrolled} / capacity=${pc?.capacity}`);

if (ok !== 1) {
  console.error('❌ 超卖或异常');
  process.exit(1);
}
console.log('✅ 未超卖');
