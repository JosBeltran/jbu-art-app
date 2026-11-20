import React from 'react'
import {createRoot} from 'react-dom/client'
import {Theme} from '@carbon/react'
import UnifiedStudio from '../../app/admin/product-studio/UnifiedStudio'
import '@carbon/styles/css/styles.css'

createRoot(document.getElementById('root')).render(<Theme theme={new URLSearchParams(location.search).get('theme') || 'white'}>
  <UnifiedStudio />
</Theme>)
