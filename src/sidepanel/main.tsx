import React from 'react'
import ReactDOM from 'react-dom/client'

function SidePanel() {
  return <main aria-label="翻译侧边栏" />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
)
