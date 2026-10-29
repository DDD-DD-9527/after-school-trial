import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { ZodError } from 'zod';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'school-operations-'));
process.env.DATA_DIR = temp;
const { raw, db } = await import('../db.js');
const { hashPassword, HttpError, signToken } = await import('../auth.js');
const { authRoutes } = await import('../routes/auth.js');
const { initializeMultiSchool } = await import('../db/multi-school.js');
const { operationsRoutes } = await import('../routes/operations.js');
const { adminRoutes } = await import('../routes/admin.js');
const app = Fastify();
const auth = (uid: number, role: any) => ({ authorization: `Bearer ${signToken({uid,role,name:'测试账号'})}` });
const adminAuth = auth(1,'admin');
let opsAuth: Record<string,string>;
const get = (url: string, headers=opsAuth) => app.inject({method:'GET',url,headers});
const post = (url:string,payload:any,headers=opsAuth)=>app.inject({method:'POST',url,payload,headers});
const put = (url:string,payload:any,headers=opsAuth)=>app.inject({method:'PUT',url,payload,headers});
async function createSchool(code: string) {
  const response = await post('/api/ops/schools',{code,name:`学校${code}`,term:'2026-秋',adminName:'校管理员',adminPhone:'13811111111',adminPassword:'school123'});
  assert.equal(response.statusCode,200,response.body);
  return response.json().school;
}
before(async()=>{
  const source=fs.readFileSync(new URL('../db/init.ts',import.meta.url),'utf8');
  const schema=source.match(/const SCHEMA = `([\s\S]*?)`;/)?.[1];
  assert.ok(schema);
  raw.exec(schema);
  raw.prepare('INSERT INTO school(id,name,term) VALUES(1,?,?)').run('原学校','2026-秋');
  raw.prepare('INSERT INTO users(id,phone,name,role,password_hash) VALUES(1,?,?,?,?)').run('13800000000','原管理员','admin',hashPassword('admin123'));
  initializeMultiSchool(raw);
  const operator=raw.prepare("SELECT id FROM users WHERE role='operator'").get() as any;
  opsAuth=auth(operator?.id??999,'operator');
  app.setErrorHandler((err,_req,reply)=>{if(err instanceof HttpError)return reply.status(err.status).send({code:err.code,message:err.message});if(err instanceof ZodError)return reply.status(400).send({code:'BAD_INPUT',message:err.issues[0]?.message});return reply.status(500).send({message:String(err)});});
  await app.register(authRoutes);
  await app.register(operationsRoutes);
  await app.register(adminRoutes);
  await app.ready();
});
after(async()=>{await app.close();await db.destroy();if(raw.open)raw.close();fs.rmSync(temp,{recursive:true,force:true});});
test('legacy school login returns the actual school context without losing its account',async()=>{
  const r=await post('/api/auth/login',{phone:'13800000000',password:'admin123'},{});
  assert.equal(r.statusCode,200);
  assert.equal(r.json().user.school?.name,'原学校');
  assert.equal(r.json().user.schoolId,1);
  assert.equal(r.json().user.id,1);
});
test('school creation atomically creates its first school admin with a required password change',async()=>{
  const school=await createSchool('create-school');
  const r=await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:school.code},{});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().user.role,'admin');
  assert.equal(r.json().user.schoolId,school.id);
  assert.equal(r.json().user.mustChangePassword,true);
  const detail=await get(`/api/ops/schools/${school.id}`);
  assert.equal(detail.json().stats.students,0);
  assert.equal(detail.json().admins.length,1);
  assert.ok(detail.json().recentEvents.length>0);
});
test('the same phone in two schools requires a school choice and resolves to the selected school',async()=>{
  const one=await createSchool('same-phone-a');const two=await createSchool('same-phone-b');
  const ambiguous=await post('/api/auth/login',{phone:'13811111111',password:'school123'},{});
  assert.equal(ambiguous.statusCode,400,ambiguous.body);
  for(const school of [one,two]){const r=await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:school.code},{});assert.equal(r.statusCode,200);assert.equal(r.json().user.schoolId,school.id);}
});
test('operators and school admins cannot exchange their roles or school contexts via a token',async()=>{
  assert.equal((await get('/api/ops/dashboard',adminAuth)).statusCode,403);
  const forged=auth(1,'operator');assert.equal((await get('/api/ops/dashboard',forged)).statusCode,403);
  assert.equal((await get('/api/me',opsAuth)).json().school,null);
});
test('duplicate school codes roll back the first administrator and audit event',async()=>{
  await createSchool('duplicate-school');
  const before=raw.prepare('SELECT count(*) n FROM users').get() as any;
  const r=await post('/api/ops/schools',{code:'duplicate-school',name:'重复学校',term:'2026-秋',adminName:'不应创建',adminPhone:'13822222222',adminPassword:'school123'});
  assert.equal(r.statusCode,409,r.body);
  assert.equal((raw.prepare('SELECT count(*) n FROM users').get() as any).n,before.n);
});
test('a disabled school blocks existing tokens and new logins while keeping its data',async()=>{
  const school=await createSchool('disabled-school');
  const login=await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:school.code},{});
  const token={authorization:`Bearer ${login.json().token}`};
  assert.equal((await put(`/api/ops/schools/${school.id}`,{name:school.name,term:school.term,status:'inactive',contactName:'',contactPhone:''})).statusCode,200);
  assert.equal((await get('/api/me',token)).statusCode,403);
  assert.equal((await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:school.code},{})).statusCode,403);
  assert.ok(raw.prepare('SELECT id FROM users WHERE school_id=?').get(school.id));
  const publicSchools=await get('/api/public/schools',{});assert.ok(!publicSchools.json().some((item:any)=>item.id===school.id));
});
test('the last active school admin cannot be disabled and another school admin cannot be edited',async()=>{
  const one=await createSchool('last-admin-a');const two=await createSchool('last-admin-b');
  const adminOne=(await get(`/api/ops/schools/${one.id}`)).json().admins[0];
  assert.equal((await put(`/api/ops/schools/${one.id}/admins/${adminOne.id}`,{name:adminOne.name,status:'inactive'})).statusCode,409);
  assert.equal((await put(`/api/ops/schools/${two.id}/admins/${adminOne.id}`,{name:'跨校修改',status:'active'})).statusCode,404);
  assert.equal((await post(`/api/ops/schools/${one.id}/admins`,{name:'第二管理员',phone:'13833333333',password:'school123'})).statusCode,200);
  const login=await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:one.code},{});
  assert.equal((await put(`/api/ops/schools/${one.id}/admins/${adminOne.id}`,{name:adminOne.name,status:'inactive'})).statusCode,200);
  assert.equal((await get('/api/me',{authorization:`Bearer ${login.json().token}`})).statusCode,403);
});
test('operator overview totals come from school data and reject invalid school creation',async()=>{
  const response=await get('/api/ops/dashboard');assert.equal(response.statusCode,200,response.body);assert.ok(response.json().summary.schools>=1);assert.equal(response.json().summary.students,0);
  assert.equal((await get('/api/ops/schools?q=&status=')).statusCode,200);
  assert.equal((await post('/api/ops/schools',{name:'',code:'bad code',adminPassword:'x'})).statusCode,400);
});

test('operators cannot enter school business and initial school administrators must change their password first',async()=>{
  assert.equal((await get('/api/admin/dashboard',opsAuth)).statusCode,403);
  const school=await createSchool('password-required');
  const login=await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:school.code},{});
  const headers={authorization:`Bearer ${login.json().token}`};
  assert.equal((await get('/api/me',headers)).statusCode,200);
  const blocked=await get('/api/admin/dashboard',headers);
  assert.equal(blocked.statusCode,403,blocked.body);
  assert.equal(blocked.json().code,'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await post('/api/auth/change-password',{oldPassword:'school123',newPassword:'changed123'},headers)).statusCode,200);
  assert.equal((await get('/api/admin/dashboard',headers)).statusCode,200);
  assert.equal((await post('/api/auth/login',{phone:'13811111111',password:'school123',schoolCode:school.code},{})).statusCode,401);
  const changed=await post('/api/auth/login',{phone:'13811111111',password:'changed123',schoolCode:school.code},{});
  assert.equal(changed.json().user.mustChangePassword,false);
});

test('an audit storage failure rolls back school and administrator creation together',async()=>{
  const counts=()=>['school','users','operations_logs'].map(table=>(raw.prepare(`SELECT count(*) n FROM ${table}`).get() as any).n);
  const before=counts();
  raw.exec("CREATE TRIGGER reject_operations_audit BEFORE INSERT ON operations_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  try {
    const response=await post('/api/ops/schools',{code:'audit-failure',name:'不能半开通的学校',term:'2026-秋',adminName:'不能残留',adminPhone:'13855555555',adminPassword:'school123'});
    assert.equal(response.statusCode,500,response.body);
    assert.deepEqual(counts(),before);
    assert.equal(raw.prepare("SELECT id FROM school WHERE code='audit-failure'").get(),undefined);
  } finally {raw.exec('DROP TRIGGER reject_operations_audit');}
});
