import React from 'react'
import {createRoot} from 'react-dom/client'
import {Theme} from '@carbon/react'
import UnifiedStudio from '../../app/admin/product-studio/UnifiedStudio'
import Products from '../../app/admin/products/page'
import '@carbon/styles/css/styles.css'
createRoot(document.getElementById('root')).render(<Theme theme={new URLSearchParams(location.search).get('theme') || 'white'}>
  {location.pathname==='/admin/products' ? <Products /> : <UnifiedStudio />}
</Theme>)
