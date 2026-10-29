import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Selectable } from 'kysely';
import { db, type User } from '../db.js';
import { HttpError, childrenOf, getUser, hashPassword, requireAuth, signToken, verifyPassword } from '../auth.js';
const loginSchema = z.object({ phone: z.string().trim().min(5).max(30), password: z.string().min(1).max(200), schoolCode: z.string().trim().max(32).optional() });
async function profile(user: Selectable<User>) {
  const school = user.school_id ? await db.selectFrom('school').select(['id','code','name','term','status']).where('id','=',user.school_id).executeTakeFirst() : null;
  const base = { id:user.id, name:user.name, role:user.role, phone:user.phone, schoolId:user.school_id, school:school??null, mustChangePassword:user.must_change_password===1 };
  if(user.role==='parent')return {...base,children:await childrenOf(user.id)};
  if(user.role==='teacher' && user.teacher_id){const teacher=await db.selectFrom('teachers').select(['id','name']).where('id','=',user.teacher_id).where('school_id','=',user.school_id!).executeTakeFirst();return {...base,teacher:teacher??null};}
  return base;
}
export async function authRoutes(app:FastifyInstance){
  app.get('/api/public/schools',async()=>db.selectFrom('school').select(['id','code','name','term']).where('status','=','active').orderBy('id').execute());
  app.post('/api/auth/login',async req=>{
    const {phone,password,schoolCode}=loginSchema.parse(req.body);
    let query=db.selectFrom('users').selectAll().where('phone','=',phone);
    if(schoolCode){
      const school=await db.selectFrom('school').select(['id']).where('code','=',schoolCode.toLowerCase()).executeTakeFirst();
      if(!school)throw new HttpError(401,'BAD_CREDENTIALS','学校、手机号或密码不正确');
      query=query.where('school_id','=',school.id).where('role','!=','operator');
    }
    let candidates=await query.execute();
    if(!schoolCode && candidates.some(u=>u.role==='operator'))candidates=candidates.filter(u=>u.role==='operator');
    if(!schoolCode && candidates.length>1)throw new HttpError(400,'SCHOOL_REQUIRED','该手机号关联多所学校，请先选择学校');
    const user=candidates[0];
    if(!user || !verifyPassword(password,user.password_hash))throw new HttpError(401,'BAD_CREDENTIALS','手机号或密码不正确');
    if(user.status!=='active')throw new HttpError(403,'ACCOUNT_DISABLED','账号已停用，请联系管理员');
    const me=await profile(user);
    if(user.role!=='operator' && (!me.school || me.school.status!=='active'))throw new HttpError(403,'SCHOOL_DISABLED','学校服务已停用，请联系学校管理员');
    return {token:signToken({uid:user.id,role:user.role,name:user.name,schoolId:user.school_id}),user:me};
  });
  app.post('/api/auth/change-password',{preHandler:requireAuth()},async req=>{
    const me=getUser(req),body=req.body as any;
    const oldPassword=String(body?.oldPassword||''),newPassword=String(body?.newPassword||'');
    if(newPassword.length<6 || newPassword.length>200)throw new HttpError(400,'WEAK_PASSWORD','新密码应为6至200位');
    if(newPassword===oldPassword)throw new HttpError(400,'SAME_PASSWORD','新密码不能与旧密码相同');
    const user=await db.selectFrom('users').selectAll().where('id','=',me.uid).executeTakeFirstOrThrow();
    if(!verifyPassword(oldPassword,user.password_hash))throw new HttpError(400,'BAD_OLD_PASSWORD','原密码不正确');
    await db.updateTable('users').set({password_hash:hashPassword(newPassword),must_change_password:0}).where('id','=',me.uid).execute();
    return {ok:true};
  });
  app.get('/api/me',{preHandler:requireAuth()},async req=>profile(await db.selectFrom('users').selectAll().where('id','=',getUser(req).uid).executeTakeFirstOrThrow()));
}
