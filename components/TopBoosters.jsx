'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Tag, SkeletonText } from '@carbon/react'
import { Trophy } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './TopBoosters.module.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TopBoosters({ artworkId }) {
  const { t, locale } = useI18n()
  const [boosters, setBoosters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTopBoosters() {
      if (!artworkId) return

      const { data, error } = await supabase
        .from('transactions')
        .select(`
          points_added,
          created_at,
          user_id,
          users ( display_name, email, user_level )
        `)
        .eq('artwork_id', artworkId)
        .eq('status', 'COMPLETED')
        .order('points_added', { ascending: false })
        .limit(5)

      if (error) {
        console.error('Error consultando TopBoosters:', error)
      } else {
        setBoosters(data || [])
      }
      setLoading(false)
    }

    fetchTopBoosters()
  }, [artworkId])

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <Trophy size={16} />
        <h4 className={styles.title}>{t('Top impulsores de esta pieza', 'Top boosters of this piece')}</h4>
      </div>

      {loading ? (
        <SkeletonText paragraph lineCount={3} />
      ) : boosters.length === 0 ? (
        <p className={styles.empty}>
          {t('Sé el primer coleccionista en impulsar esta obra para figurar aquí.', 'Be the first collector to boost this artwork to appear here.')}
        </p>
      ) : (
        <div className={styles.list}>
          {boosters.map((item, index) => {
            const userName =
              item.users?.display_name ||
              item.users?.email?.split('@')[0] ||
              t('Mecenas anónimo', 'Anonymous patron')
            const level = item.users?.user_level || 1
            const tagType = index === 0 ? 'magenta' : index === 1 ? 'cyan' : 'cool-gray'

            return (
              <div key={`${item.user_id}-${index}`} className={styles.row}>
                <div className={styles.identity}>
                  <span className={`${styles.rank} ${index === 0 ? styles.rankFirst : ''}`}>
                    {index + 1}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <span className={styles.name}>{userName}</span>
                    <span className={styles.level}>{t(`Nivel ${level} · Curador`, `Level ${level} · Curator`)}</span>
                  </div>
                </div>

                <Tag type={tagType} size="sm">
                  +{Number(item.points_added || 0).toLocaleString(locale)} pts
                </Tag>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
