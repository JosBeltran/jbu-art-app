'use client'

import { useEffect, useState } from 'react'
import { fetchEnumValues, fetchOptionsByColumn } from '@/lib/supabaseUtils'
import { useI18n } from '@/components/I18nProvider'

interface EnumSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  tableName?: string
  columnName?: string
  enumName?: string
  label?: string
  transformLabel?: (val: string) => string
}

export default function EnumSelect({
  tableName,
  columnName,
  enumName,
  label,
  value,
  onChange,
  className,
  transformLabel = (val) => val.replace(/_/g, ' '),
  ...props
}: EnumSelectProps) {
  const { t } = useI18n()
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadOptions() {
      setLoading(true)
      let fetchedOptions: string[] = []

      if (tableName && columnName) {
        fetchedOptions = await fetchOptionsByColumn(tableName, columnName)
      } else if (enumName) {
        fetchedOptions = await fetchEnumValues(enumName)
      }

      if (isMounted) {
        setOptions(fetchedOptions)
        setLoading(false)
      }
    }

    loadOptions()

    return () => {
      isMounted = false
    }
  }, [tableName, columnName, enumName])

  return (
    <div>
      {label && (
        <label className="block text-[10px] font-mono uppercase text-violet-400 mb-1">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={loading || props.disabled}
        className={
          className ||
          'w-full bg-violet-950 border border-violet-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none disabled:opacity-50'
        }
        {...props}
      >
        {loading ? (
          <option value="">{t('Cargando opciones...', 'Loading options...')}</option>
        ) : (
          options.map((opt) => (
            <option key={opt} value={opt}>
              {transformLabel(opt)}
            </option>
          ))
        )}
      </select>
    </div>
  )
}