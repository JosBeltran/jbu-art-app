import { Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { printBorderOptions } from '@/lib/productCatalog/wallArt'

export default function PrintBorderSelect({ id, variant, value, onChange }) {
  const { t } = useI18n()
  return <Select id={id} labelText={t('Borde blanco por lado','White border per side')}
    value={value} onChange={event=>onChange(Number(event.target.value))}>
    {printBorderOptions.filter(mm=>mm===0 || Math.min(variant.widthMm,variant.heightMm)>2*mm)
      .map(mm=><SelectItem key={mm} value={mm} text={mm ? mm+' mm' : t('Sin borde adicional','No additional border')} />)}
  </Select>
}
