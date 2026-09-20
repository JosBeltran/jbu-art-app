import { getArtworks } from '@/lib/artworks'
import CatalogClient from './CatalogClient'
import { Grid, Column, Breadcrumb, BreadcrumbItem } from '@carbon/react'
import Link from 'next/link'

export const revalidate = 0 

export default async function Page() {
  const artworks = await getArtworks()

  return (
    <main className="min-h-screen flex flex-col">
      {/* ======================================================
          HERO / ENCABEZADO DE ANCHO COMPLETO (Tipo IBM)
          ====================================================== */}
      <div className="bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] pt-6 pb-8 px-4 sm:px-8 mb-8">
        <Grid className="cds--grid--full-width">
          <Column sm={16} md={16} lg={16}>
            
            <Breadcrumb noTrailingSlash className="mb-4">
              <BreadcrumbItem>
                <Link href="/" className="cds--link text-xs uppercase tracking-wider">Inicio</Link>
              </BreadcrumbItem>
              <BreadcrumbItem isCurrentPage>
                <span className="text-xs uppercase tracking-wider text-[var(--cds-text-secondary)]">Catálogo de Obras</span>
              </BreadcrumbItem>
            </Breadcrumb>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tight text-[var(--cds-text-primary)] mb-3" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Catálogo de Obras
            </h1>
            
            <p className="cds--type-body-long-01 text-[var(--cds-text-secondary)] max-w-2xl">
              Explora la colección original de arte contemporáneo, series exclusivas y proyectos de estudio.
            </p>

          </Column>
        </Grid>
      </div>

      {/* ======================================================
          CONTENEDOR CLIENTE (Maneja la barra lateral alineada)
          ====================================================== */}
      <div className="flex-1 px-4 sm:px-8 pb-16">
        <CatalogClient initialArtworks={artworks} />
      </div>
    </main>
  )
}