import {sendNotificationEmail} from '@/lib/emails/sendEmail'
export async function deliverNotificationEmails(db,scope=null){
 const r=await db.rpc('claim_notification_emails',{_scope:scope});if(r.error){console.error('[notifications] outbox',r.error);return}
 for(const row of r.data||[]){try{await sendNotificationEmail(row);await db.from('notifications').update({email_sent_at:new Date().toISOString(),email_error:null}).eq('id',row.id).eq('email_lease_until',row.email_lease_until)}catch(e){console.error('[notifications] email pending',{id:row.id,error:e.message});await db.from('notifications').update({email_error:String(e.message).slice(0,400)}).eq('id',row.id).eq('email_lease_until',row.email_lease_until)}}
}
