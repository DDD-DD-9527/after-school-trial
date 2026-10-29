import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { raw } from '../db.js';
import { getUser, hashPassword, HttpError, requireAuth } from '../auth.js';

const guard={preHandler:requireAuth('operator')};
const status=z.enum(['active','inactive']);
const phone=z.string().trim().regex(/^1\d{10}$/,'请输入11位手机号');
const password=z.string().min(6,'初始密码至少6位').max(200);
const settings=z.object({name:z.string().trim().min(1,'请填写学校名称').max(80),term:z.string().trim().min(1,'请填写当前学期').max(50),contactName:z.string().trim().max(80).optional().default(''),contactPhone:z.string().trim().max(30).optional().default('')});
const create=settings.extend({code:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,31}$/,'学校编码为2至32位字母、数字或短横线'),adminName:z.string().trim().min(1).max(50),adminPhone:phone,adminPassword:password});
const administrator=z.object({name:z.string().trim().min(1).max(50),phone,password});
function idOf(value:unknown){const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'BAD_INPUT','学校或账号编号不正确');return id;}
function schoolRow(id:number){const row=raw.prepare('SELECT * FROM school WHERE id=?').get(id) as any;if(!row)throw new HttpError(404,'NOT_FOUND','学校不存在');return row;}
function publicSchool(row:any){return {id:row.id,code:row.code,name:row.name,term:row.term,status:row.status,contactName:row.contact_name,contactPhone:row.contact_phone,createdAt:row.created_at};}
function schoolStats(id:number){
  const count=(table:string,condition='')=>Number((raw.prepare(`SELECT count(*) n FROM ${table} WHERE school_id=? ${condition}`).get(id) as any).n);
  const outstanding=Number((raw.prepare("SELECT coalesce(sum(max(b.amount_cents-b.paid_cents,0)),0) n FROM bills b JOIN courses c ON c.id=b.course_id JOIN students s ON s.id=b.student_id WHERE c.school_id=? AND s.school_id=? AND b.status!='void'").get(id,id) as any).n);
  return {students:count('students',"AND status='active'"),teachers:count('teachers',"AND status='active'"),courses:count('courses',"AND status='published'"),admins:count('users',"AND role='admin' AND status='active'"),outstanding};
}
function overview(row:any){return {...publicSchool(row),stats:schoolStats(row.id)};}
function audit(req:FastifyRequest,schoolId:number,action:string,detail:string){const actor=getUser(req);raw.prepare('INSERT INTO operations_logs(school_id,actor_id,actor_name,action,detail) VALUES(?,?,?,?,?)').run(schoolId,actor.uid,actor.name,action,detail);}
function schoolDetail(id:number){
  const school=schoolRow(id);
  const admins=raw.prepare("SELECT id,name,phone,status,created_at AS createdAt FROM users WHERE school_id=? AND role='admin' ORDER BY id").all(id);
  const recentEvents=raw.prepare('SELECT id,action,actor_name AS actorName,detail,created_at AS createdAt FROM operations_logs WHERE school_id=? ORDER BY id DESC LIMIT 30').all(id);
  return {school:publicSchool(school),stats:schoolStats(id),admins,recentEvents};
}
export async function operationsRoutes(app:FastifyInstance){
  app.get('/api/ops/dashboard',guard,async()=>{
    const schools=(raw.prepare('SELECT * FROM school ORDER BY id DESC').all() as any[]).map(overview);
    const summary={schools:schools.length,activeSchools:schools.filter(s=>s.status==='active').length,admins:0,students:0,teachers:0,courses:0,unpaidCents:0};
    for(const school of schools){for(const key of ['admins','students','teachers','courses'] as const)summary[key]+=school.stats[key];summary.unpaidCents+=school.stats.outstanding;}
    return {summary,schools};
  });
  app.get('/api/ops/schools',guard,async req=>{
    const query=z.object({q:z.string().trim().max(100).optional().default(''),status:z.preprocess(value=>value===''?undefined:value,status.optional())}).parse(req.query);
    return (raw.prepare('SELECT * FROM school ORDER BY id DESC').all() as any[]).filter(row=>(!query.status||row.status===query.status)&&(!query.q||`${row.name} ${row.code} ${row.contact_name} ${row.contact_phone}`.toLowerCase().includes(query.q.toLowerCase()))).map(overview);
  });
  app.post('/api/ops/schools',guard,async req=>{
    const body=create.parse(req.body);
    return raw.transaction(()=>{
      if(raw.prepare('SELECT id FROM school WHERE code=? COLLATE NOCASE').get(body.code))throw new HttpError(409,'DUPLICATE','学校编码已存在，请更换编码');
      const inserted=raw.prepare("INSERT INTO school(code,name,term,status,contact_name,contact_phone,created_at) VALUES(?,?,?,'active',?,?,?)").run(body.code,body.name,body.term,body.contactName,body.contactPhone,new Date().toISOString());
      const schoolId=Number(inserted.lastInsertRowid);
      const administratorId=Number(raw.prepare("INSERT INTO users(phone,name,role,password_hash,school_id,status,must_change_password) VALUES(?,?,'admin',?,?,'active',1)").run(body.adminPhone,body.adminName,hashPassword(body.adminPassword),schoolId).lastInsertRowid);
      audit(req,schoolId,'school_created',`开通学校 ${body.name}（${body.code}），创建首位校管理员 ${body.adminName}`);
      return {school:publicSchool(schoolRow(schoolId)),admin:{id:administratorId,name:body.adminName,phone:body.adminPhone}};
    })();
  });
  app.get('/api/ops/schools/:id',guard,async req=>schoolDetail(idOf((req.params as any).id)));
  app.put('/api/ops/schools/:id',guard,async req=>{
    const id=idOf((req.params as any).id),body=settings.extend({status}).parse(req.body);
    return raw.transaction(()=>{
      const old=schoolRow(id);
      if(body.status==='active'&&!raw.prepare("SELECT id FROM users WHERE school_id=? AND role='admin' AND status='active' LIMIT 1").get(id))throw new HttpError(409,'ADMIN_REQUIRED','启用学校前至少需要一位有效校管理员');
      raw.prepare('UPDATE school SET name=?,term=?,status=?,contact_name=?,contact_phone=? WHERE id=?').run(body.name,body.term,body.status,body.contactName,body.contactPhone,id);
      audit(req,id,old.status!==body.status?(body.status==='active'?'school_enabled':'school_disabled'):'school_updated',old.status!==body.status?`${body.status==='active'?'启用':'停用'}学校 ${body.name}`:`更新学校资料：${body.name}，学期 ${body.term}`);
      return {school:publicSchool(schoolRow(id))};
    })();
  });
  app.post('/api/ops/schools/:id/admins',guard,async req=>{
    const id=idOf((req.params as any).id),body=administrator.parse(req.body);
    return raw.transaction(()=>{
      schoolRow(id);
      if(raw.prepare('SELECT id FROM users WHERE school_id=? AND phone=?').get(id,body.phone))throw new HttpError(409,'DUPLICATE','该手机号已在本校使用');
      const userId=Number(raw.prepare("INSERT INTO users(phone,name,role,password_hash,school_id,status,must_change_password) VALUES(?,?,'admin',?,?,'active',1)").run(body.phone,body.name,hashPassword(body.password),id).lastInsertRowid);
      audit(req,id,'admin_created',`新增校管理员 ${body.name}（${body.phone}）`);
      return {id:userId,name:body.name,phone:body.phone,status:'active'};
    })();
  });
  app.put('/api/ops/schools/:id/admins/:userId',guard,async req=>{
    const id=idOf((req.params as any).id),userId=idOf((req.params as any).userId),body=z.object({name:z.string().trim().min(1).max(50),status}).parse(req.body);
    return raw.transaction(()=>{
      const school=schoolRow(id);
      const user=raw.prepare("SELECT * FROM users WHERE id=? AND school_id=? AND role='admin'").get(userId,id) as any;
      if(!user)throw new HttpError(404,'NOT_FOUND','本校校管理员不存在');
      if(school.status==='active'&&user.status==='active'&&body.status==='inactive'&&schoolStats(id).admins<=1)throw new HttpError(409,'LAST_ADMIN','有效学校至少保留一位有效校管理员');
      raw.prepare('UPDATE users SET name=?,status=? WHERE id=? AND school_id=?').run(body.name,body.status,userId,id);
      audit(req,id,user.status!==body.status?(body.status==='active'?'admin_enabled':'admin_disabled'):'admin_updated',`${body.status==='active'?'维护':'停用'}校管理员 ${body.name}`);
      return {ok:true};
    })();
  });
}
