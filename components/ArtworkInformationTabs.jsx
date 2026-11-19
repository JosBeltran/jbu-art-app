'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import styles from '../app/artwork/[sku]/ArtworkDetail.module.css'

const fragments = ['details', 'provenance', 'community']
const destinations = {details:0, specifications:0, provenance:1, authenticity:1, 'artwork-versions':1, 'artwork-provenance':1, 'artwork-registration':1, community:2, 'community-momentum':2}

export default function ArtworkInformationTabs({ details, provenance, community }) {
  const {t} = useI18n()
  const [selected,setSelected] = useState(0)
  const [communityVisited,setCommunityVisited] = useState(false)
  useEffect(()=>{
    let frame=0
    function sync() {
      const fragment=window.location.hash.slice(1)
      const recognized=Object.hasOwn(destinations,fragment)
      const index=recognized ? destinations[fragment] : 0
      setSelected(index)
      if(index===2)setCommunityVisited(true)
      cancelAnimationFrame(frame)
      if(recognized)frame=requestAnimationFrame(()=>{
        const target=document.getElementById(fragment)||document.getElementById(fragments[index])
        target?.scrollIntoView({block:'start'})
      })
    }
    sync()
    window.addEventListener('hashchange',sync)
    window.addEventListener('popstate',sync)
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync)}
  },[])
  function select({selectedIndex}) {
    setSelected(selectedIndex)
    if(selectedIndex===2)setCommunityVisited(true)
    const url=new URL(window.location.href)
    url.hash=fragments[selectedIndex]
    // Routine tab changes replace the current entry and preserve country/discussion queries.
    window.history.replaceState(window.history.state,'',url)
  }
  return <section className={styles.informationTabs} aria-label={t('Información de la obra','Artwork information')}>
    <Tabs selectedIndex={selected} onChange={select}>
      <TabList aria-label={t('Información de la obra','Artwork information')} activation="automatic">
        <Tab>{t('Detalles y ficha técnica','Details & Specifications')}</Tab>
        <Tab>{t('Proveniencia y autenticidad','Provenance & Authenticity')}</Tab>
        <Tab>{t('Impulso comunitario','Community Momentum')}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel><div id="details">{details}</div></TabPanel>
        <TabPanel><div id="provenance">{provenance}</div></TabPanel>
        <TabPanel><div id="community">{communityVisited ? community : null}</div></TabPanel>
      </TabPanels>
    </Tabs>
  </section>
}
