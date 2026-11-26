import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminApp } from '../src/admin'
import '../src/admin/styles.css'
import { resources } from './resources'

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing')

createRoot(root).render(
  <StrictMode>
    <AdminApp title="Kiln" resources={resources} />
  </StrictMode>,
)
