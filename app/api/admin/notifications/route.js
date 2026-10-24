import {requirePreviewAdmin} from '@/lib/collection/admin.server'
import {serviceClient} from '@/lib/certificates/adminAuth.server'
import {deliverNotificationEmails} from '@/lib/notifications.server'
export async function POST(request){try{await requirePreviewAdmin(request);await deliverNotificationEmails(serviceClient());return Response.json({queued:true})}catch(e){return Response.json({error:e.code||'No se pudieron reintentar los correos.'},{status:e.status||503})}}
