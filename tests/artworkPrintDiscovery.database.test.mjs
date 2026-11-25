import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const art='10000000-0000-4000-8000-000000000001'
const print='10000000-0000-4000-8000-000000000002'
const actor='10000000-0000-4000-8000-000000000003'
const migrations = [
  '20261208_independent_product_catalog.sql',
  '20261209_product_catalog_legacy_reference.sql',
  '20261210_product_provider_workflows.sql',
  '20261211_product_fulfillment_preparation.sql',
  '20261212_wall_art_studio.sql',
  '20261213_fine_art_commerce.sql',
  '20261214_unified_product_studio.sql',
  '20261215_persistent_supplier_catalog.sql',
  '20261217_provider_native_metadata.sql',
  '20261218_product_studio_matrix_handoff.sql',
  '20261219_studio_print_publication.sql',
  '20261220_studio_print_border.sql',
  '20261221_studio_print_asset_reuse.sql',
  '20261222_studio_production_readiness.sql',
  '20261224_studio_variant_attributes.sql',
]

const db=new PGlite()
const migration=file=>readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')
const one=async(sql,params)=>(await db.query(sql,params)).rows[0]
before(async()=>{
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.objects(bucket_id text,name text);
    create function valid_shipping_countries(text[]) returns boolean language sql immutable
      as $$ select $1 is null or $1 <@ array['MX','US','CA','GB','SE']::text[] $$;
    create table artworks(id uuid primary key,title text,title_en text,sku text,primary_image_url text,physical_edition_type text,
      status text,is_historical_version boolean,version_kind text,version_parent_id uuid references artworks,version_published_at timestamptz,allows_prints boolean,
      print_price_mxn numeric,base_price_mxn numeric,calculated_price_mxn numeric,allowed_shipping_countries text[],shipping_policy_ids uuid[]);
    create table artwork_prints(id uuid primary key,artwork_id uuid references artworks,
      title text,sku text,price numeric,is_active boolean default false,is_available boolean default true,size text,paper_type text,finish text,framing text,edition_type text,allowed_shipping_countries text[]);
    create table site_settings(id boolean primary key,global_shipping_countries text[],default_shipping_policies jsonb);
    insert into site_settings values(true,array['MX','US'],'{"open_print":["10000000-0000-4000-8000-000000000008"]}');
    create table shipping_policies(id uuid primary key,active boolean,method text,postal_codes text[],countries text[]);
    insert into shipping_policies values('10000000-0000-4000-8000-000000000008',true,'INCLUDED','{}','{}');
    create view artworks_discoverable as select * from artworks;
    create table orders(id uuid primary key default gen_random_uuid(),shipping_address jsonb,stripe_session_id text,payment_method text,payment_status text,
      status text,charged_currency text,buyer_name text,buyer_email text,buyer_phone text,stripe_payment_intent_id text,
      total_amount_mxn numeric,paid_at timestamptz,buyer_user_id uuid,charged_amount numeric,fx_usd_per_mxn numeric);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders,print_variant_id uuid references artwork_prints,
      title_snapshot text,unit_price_mxn numeric,quantity integer,artwork_id uuid,sku_snapshot text,
      product_type_snapshot text,print_image_url_snapshot text,print_size_snapshot text,print_finish_snapshot text,claim_token_snapshot text,physical_edition_unit_id uuid);
    create function block_unimplemented_physical_edition_sales() returns trigger language plpgsql
      as $$begin
        if new.artwork_id is null then return new;end if;
        raise exception 'legacy guard fixture';
      end$$;
    create trigger fixture_guard before insert on order_items
       for each row execute function block_unimplemented_physical_edition_sales();
    create table print_order_preparations(item_id uuid,revision_id uuid,state text);
    create table print_asset_generations(revision_id uuid,production_file_path text, artwork_id uuid, print_id uuid,
      size text, is_current boolean, production_status text, layout jsonb, effective_dpi int, generated_at timestamptz default now(), master_approved_at timestamptz, master_source_ref jsonb);
    grant select on artworks,artwork_prints,orders,order_items,print_order_preparations,print_asset_generations to service_role;
    insert into artworks(id,title,sku,status,allows_prints,base_price_mxn,calculated_price_mxn)
      values('${art}','Mar','MAR','AVAILABLE',true,1300,1450);
    insert into artwork_prints(id,artwork_id,title,sku,price,size,paper_type,finish,edition_type)
      values('${print}','${art}','Mar print','MAR-P',400,'A3','Cotton','MATTE','OPEN');
  `)

  for(const file of migrations)await db.exec(await migration(file))
  await db.exec(`
    alter table artwork_prints add column image_url text,add column print_gallery_image_id uuid,add column print_provenance_image_id uuid;
    create table artwork_images(id uuid,artwork_id uuid,image_url text);
    create table provenance_event_images_public(id uuid,artwork_id uuid,image_url text);
    alter table print_asset_generations
      alter column revision_id set default gen_random_uuid(),
      alter column is_current set default true,
      add column request_id uuid,add column source_image_ref jsonb,add column border_mode text,
      add column generated_by uuid,add column preview_image_url text,
      add column master_lease uuid,add column master_lease_until timestamptz,add column master_error text,
      add constraint print_asset_generations_size_check check(size in ('A2','A3'));
    create function save_admin_artwork_print(_print jsonb,_create boolean)
    returns jsonb language plpgsql as $$
    declare row artwork_prints;
    begin
      if _create then
        insert into artwork_prints(id,artwork_id,title,size,is_active) values(
          (_print->>'id')::uuid,(_print->>'artwork_id')::uuid,_print->>'title',_print->>'size',(_print->>'is_active')::boolean);
      end if;
      select * into row from artwork_prints where id=(_print->>'id')::uuid;
      return to_jsonb(row);
    end $$;
    update artworks set primary_image_url='https://project.supabase.co/storage/v1/object/public/artworks/source.jpg';
  `)
  await db.exec(await migration('20261228_artwork_print_discovery_sizes.sql'))
  await db.exec(await migration('20261229_artwork_print_master_attachment.sql'))
})
after(()=>db.close())

test('migration backfills only recognized sizes without changing Artwork Print IDs',async()=>{
  const row=await one('select id,size,size_code from artwork_prints where id=$1',[print])
  assert.deepEqual(row,{id:print,size:'A3',size_code:'A3'})
  assert.equal((await one("select normalized_artwork_print_size('50 × 70 cm') code")).code,'50X70CM')
  assert.equal((await one("select normalized_artwork_print_size('custom') code")).code,null)
  const catalog=(await db.query('select code,width_mm,height_mm from artwork_print_sizes')).rows
  assert.equal(catalog.length,25)
})

test('selection and draft pin a print without a master, then resolve only that print after attachment',async()=>{
  const {id:source}=await one("insert into artwork_prints(id,artwork_id,title,size,is_active) values(gen_random_uuid(),$1,'Source A2','A2',true) returning id",[art])
  const {id:other}=await one("insert into artwork_prints(id,artwork_id,title,size,is_active) values(gen_random_uuid(),$1,'Other A2','A2',true) returning id",[art])
  const spec={externalVariantId:'a2',title:'A2',widthMm:420,heightMm:594,attributes:{size:'A2',orientation:'portrait'}}
  await one("insert into provider_catalog_products(provider_code,external_id,title) values('gelato','reference-paper','Paper')")
  await one("insert into provider_catalog_variants(provider_code,external_id,external_variant_id,specification) values('gelato','reference-paper','a2',$1)",[JSON.stringify(spec)])
  const {id:session}=await one("insert into product_discovery_sessions(artwork_id,created_by,criteria) values($1,$2,$3) returning id",
    [art,actor,JSON.stringify({workflow:'wall_art',providers:['gelato'],countries:['MX'],requireValidatedMasters:true})])
  const {id:candidate}=await one("insert into product_discovery_candidates(session_id,provider_code,external_id,external_variant_id,catalog_snapshot) values($1,'gelato','reference-paper','a2',$2) returning id",
    [session,JSON.stringify({variant:spec})])
  await one("select set_studio_print_selection($1,$2,$3,'{}',$4)",[actor,session,candidate,source])
  const manifest=(await one('select criteria from product_discovery_sessions where id=$1',[session])).criteria.matrixSelections
  assert.equal(manifest[0].artworkPrintId,source)
  await assert.rejects(one("select set_studio_print_selection($1,$2,$3,'{}',$4)",[actor,session,candidate,other]),/studio_artwork_print_required/)
  const payload=[{family:'fine_art_print',titleEs:'Pinned draft',variants:[{candidateId:candidate,artworkPrintId:source,
    attributes:{size:'A2',orientation:'portrait'},fit:'contain',borderMm:0,scenes:['gallery'],primaryScene:'gallery',prices:[]}]}]
  await one('update artwork_prints set is_active=false where id=$1',[source])
  await assert.rejects(one('select save_wall_art_studio($1,$2,$3) ids',[actor,session,JSON.stringify(payload)]),/studio_artwork_print_required/)
  await one('update artwork_prints set is_active=true where id=$1',[source])
  const {ids}=await one('select save_wall_art_studio($1,$2,$3) ids',[actor,session,JSON.stringify(payload)])
  const variant=await one('select * from product_variants where product_id=$1',[ids[0]])
  assert.equal(variant.artwork_print_id,source)
  assert.equal(variant.status,'draft')
  await assert.rejects(one("update product_variants set artwork_print_id=$2 where id=$1",[variant.id,other]),/print_identity_locked/)
  await assert.rejects(one("update artwork_prints set size_code='A1' where id=$1",[source]),/print_identity_locked/)
  await assert.rejects(one('delete from artwork_prints where id=$1',[source]),/foreign key/)

  const layout={algorithmVersion:2,size:'A2',width:4961,height:7016,sourceWidth:4961,sourceHeight:7016,
    paperWidthMm:420,paperHeightMm:594,effectiveDpi:300,outputDpi:300,fitStrategy:'contain',crop:null,
    marginsMm:{top:0,right:0,bottom:0,left:0}}
  const attach=async(id,expected=null)=>{
    const request=crypto.randomUUID()
    const path='attached/'+art+'/'+id+'/'+request+'/master.jpg'
    return one('select attach_artwork_print_master($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
      [id,expected,'A2',path,request,actor,'a'.repeat(64),JSON.stringify(layout),300])
  }
  await attach(other)
  assert.notEqual((await one('select * from studio_print_master_resolution($1)',[variant.id])).status,'available')
  const attached=(await attach(source)).result
  assert.equal(attached.printId,source)
  const resolution=await one('select * from studio_print_master_resolution($1)',[variant.id])
  assert.equal(resolution.status,'available')
  assert.equal(resolution.revision_id,attached.revisionId)
  await one('select link_studio_print_master($1)',[variant.id])
  assert.ok((await one('select production_asset_id from provider_product_mappings where product_variant_id=$1',[variant.id])).production_asset_id)
  assert.equal((await one('select artwork_print_id from product_variants where id=$1',[variant.id])).artwork_print_id,source)
  assert.equal(Number((await one('select count(*) n from orders')).n),0)
})

test('attaching to a pending preview preserves its revision ID and rejects stale requests',async()=>{
  const {id}=await one("insert into artwork_prints(id,artwork_id,title,size,is_active) values(gen_random_uuid(),$1,'Pending','A3',true) returning id",[art])
  const {revision_id}=await one("insert into print_asset_generations(artwork_id,print_id,size,is_current,production_status,layout) values($1,$2,'A3',true,'PREVIEW_ONLY',$3) returning revision_id",
    [art,id,JSON.stringify({effectiveDpi:240,paperWidthMm:297,paperHeightMm:420})])
  const request=crypto.randomUUID()
  const args=[id,crypto.randomUUID(),'A3','attached/'+art+'/'+id+'/'+request+'/master.jpg',request,actor,'b'.repeat(64),
    JSON.stringify({algorithmVersion:2,size:'A3'}),300]
  await assert.rejects(one('select attach_artwork_print_master($1,$2,$3,$4,$5,$6,$7,$8,$9)',args),/layout_changed/)
  args[1]=revision_id
  const {result}=await one('select attach_artwork_print_master($1,$2,$3,$4,$5,$6,$7,$8,$9) result',args)
  assert.equal(result.revisionId,revision_id)
  assert.equal(Number((await one('select count(*) n from print_asset_generations where print_id=$1',[id])).n),1)
  assert.equal((await one('select production_status from print_asset_generations where revision_id=$1',[revision_id])).production_status,'MASTER_READY')
})

