import {deliveryRequestSchema} from '@/lib/deliverySchemas'
import {serviceClient} from '@/lib/offersAuth'
import {createDelivery,deliveryQuote,deliveryResponseError,loadDeliveryConfig} from '@/lib/localDelivery.server'
export const dynamic='force-dynamic'
export async function GET(){try{return Response.json({config:await loadDeliveryConfig(serviceClient())},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({config:{enabled:false,paymentOnDeliveryEnabled:false}},{headers:{'Cache-Control':'no-store'}})}}
export async function POST(request){try{const body=deliveryRequestSchema.parse(await request.json());if(body.action==='QUOTE')return Response.json(await deliveryQuote(serviceClient(),body),{headers:{'Cache-Control':'no-store'}});if(body.action!=='CREATE')throw new Error('invalid_action');return Response.json(await createDelivery(request,body),{headers:{'Cache-Control':'no-store'}})}catch(error){return deliveryResponseError(error)}}
