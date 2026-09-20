import { getArtworks } from '@/lib/artworks'
import CatalogClient from './catalog/CatalogClient'

import {
  Grid,
  Column,
  Breadcrumb,
  BreadcrumbItem,
  Heading,
  Section,
} from '@carbon/react'

import Link from 'next/link'

export const revalidate = 0

export default async function Page() {
  const artworks = await getArtworks()

  return (
   <main
  className="
    min-h-screen
    pt-24
    sm:pt-28
    bg-[var(--cds-background)]
  "
>

  {/* ======================================================
      PAGE HEADER
      ====================================================== */}

  <Grid className="cds--grid--full-width">

    <Column
      sm={16}
      md={14}
      lg={12}
    >
      <Section
        level={1}
        className="
          py-12
          md:py-16
        "
      >

        <Breadcrumb
          noTrailingSlash
          className="mb-8"
        >
          <BreadcrumbItem>
            <Link href="/">
              Inicio
            </Link>
          </BreadcrumbItem>

          <BreadcrumbItem isCurrentPage>
            Catálogo
          </BreadcrumbItem>
        </Breadcrumb>


        <Heading>
          Catálogo de Obras
        </Heading>


        <p className="
          cds--type-body-long-02
          text-[var(--cds-text-secondary)]
          max-w-3xl
          mt-4
        ">
          Explora obras originales, series y proyectos
          de estudio del archivo de JBU.
        </p>

      </Section>
    </Column>

  </Grid>


  {/* ======================================================
      CONTENIDO
      ====================================================== */}

  <section className="
    pb-20
  ">

    <Grid className="cds--grid--full-width">

      <Column
        sm={16}
        md={16}
        lg={16}
      >

        <CatalogClient
          initialArtworks={artworks}
        />

      </Column>

    </Grid>

  </section>

</main>
  )
}