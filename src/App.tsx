import './App.css'
import { DEFAULT_DESIGNER_CONFIG, Designer } from './designer'

function App() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Designer initialConfig={DEFAULT_DESIGNER_CONFIG} />
    </main>
  )
}

export default App
