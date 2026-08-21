import React from 'react'
import ReactDOM from 'react-dom/client'

function OptionsPage() {
  return <main aria-label="扩展设置" />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>,
)
