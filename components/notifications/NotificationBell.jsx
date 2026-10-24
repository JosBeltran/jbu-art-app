'use client'
import {useEffect,useState} from 'react'
import {HeaderGlobalAction} from '@carbon/react'
import {Notification} from '@carbon/icons-react'
import {useI18n} from '@/components/I18nProvider'
import {authHeaders} from '@/lib/authHeaders'
import styles from './Notifications.module.css'
export default function NotificationBell({userId}){const {t}=useI18n();const [count,setCount]=useState(0);useEffect(()=>{let active=true;setCount(0);if(!userId)return;const refresh=async()=>{try{const r=await fetch('/api/notifications',{headers:await authHeaders(),cache:'no-store'}),d=await r.json();if(active)setCount(r.ok?d.unread||0:0)}catch{if(active)setCount(0)}};refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[userId]);if(!userId)return null;return <HeaderGlobalAction aria-label={`${t('Notificaciones','Notifications')}${count?` (${count})`:''}`} tooltipAlignment="center" onClick={()=>{window.location.href='/notifications'}}><Notification size={20}/>{count>0&&<span className={styles.badge} aria-hidden="true">{count>99?'99+':count}</span>}</HeaderGlobalAction>}
