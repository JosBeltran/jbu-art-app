import React from 'react'
import {createRoot} from 'react-dom/client'
import {Theme} from '@carbon/react'
import PrintManager from '../../app/admin/prints/PrintManager'
import '@carbon/styles/css/styles.css'
createRoot(document.getElementById('root')).render(<Theme theme="g100"><PrintManager initialArtwork="10000000-0000-4000-8000-000000000001" /></Theme>)
