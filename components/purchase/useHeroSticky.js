'use client'
import { useEffect } from 'react'

// Position changes never change the panel's size or create an inner scroller.
export default function useHeroSticky(ref) {
  useEffect(()=>{
    const panel=ref.current
    if(!panel)return
    const headers=[...document.querySelectorAll('.cds--header, header[role="banner"], .jbu-announcement-navbar')]
    function measure(){
      const headerBottom=Math.max(0,...headers.map(header=>{
        const position=getComputedStyle(header).position
        return ['fixed','sticky'].includes(position)?header.getBoundingClientRect().bottom:0
      }))
      const announcement=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--jbu-announcement-height'))||0
      const top=Math.max(headerBottom,announcement+64)+16
      panel.style.setProperty('--artwork-sticky-top',top+'px')
      panel.dataset.sticky=String(window.innerWidth>=1024 && panel.getBoundingClientRect().height<=window.innerHeight-top-24)
    }
    const observer=new ResizeObserver(measure)
    observer.observe(panel)
    headers.forEach(header=>observer.observe(header))
    observer.observe(document.documentElement)
    const announcementObserver=new MutationObserver(measure)
    announcementObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style']})
    window.addEventListener('resize',measure)
    measure()
    return ()=>{observer.disconnect();announcementObserver.disconnect();window.removeEventListener('resize',measure)}
  },[ref])
}
