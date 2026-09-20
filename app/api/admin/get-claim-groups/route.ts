import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: groups, error } = await supabaseAdmin
      .from('claim_groups')
      .select(`
        *,
        order_items (
          id,
          title_snapshot,
          sku_snapshot,
          unit_price_mxn,
          is_claimed,
          claimed_at,
          artwork_id,
          artworks (
            *
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ groups })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}