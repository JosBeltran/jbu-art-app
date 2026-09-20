import { supabase } from '@/lib/supabaseClient'

/**
 * Obtiene los valores de un tipo ENUM en PostgreSQL.
 */
export async function fetchEnumValues(enumName: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('get_enum_values', { enum_type: enumName })
    if (error || !data) return []
    return data.map((item: { enumlabel: string }) => item.enumlabel)
  } catch (err) {
    console.error(`Error en fetchEnumValues para ${enumName}:`, err)
    return []
  }
}

/**
 * Obtiene dinámicamente las opciones para una columna dada.
 * Si la columna es un ENUM nativo, devuelve sus valores de definición.
 * Si es TEXT/VARCHAR, hace un SELECT DISTINCT para obtener las opciones existentes.
 */
export async function fetchOptionsByColumn(tableName: string, columnName: string): Promise<string[]> {
  try {
    // 1. Verificar si la columna usa un tipo ENUM nativo
    const { data: enumName } = await supabase.rpc('get_column_enum_name', {
      target_table: tableName,
      target_column: columnName
    })

    if (enumName) {
      return await fetchEnumValues(enumName)
    }

    // 2. Fallback: Si no es ENUM, obtener los valores DISTINCT de la columna
    const { data: distinctData, error } = await supabase.rpc('get_column_distinct_values', {
      target_table: tableName,
      target_column: columnName
    })

    if (error || !distinctData) return []
    return distinctData.map((item: { value: string }) => item.value)
  } catch (err) {
    console.error(`Error al obtener opciones para ${tableName}.${columnName}:`, err)
    return []
  }
}