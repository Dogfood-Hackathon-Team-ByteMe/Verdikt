/**
 * App — router root. Page composition lives in ./routes.tsx; the session
 * provider wraps everything so AccountMenu and the guards can read it.
 */
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { AppRoutes } from './routes'
import { ScrollToTop } from './ui/ScrollToTop'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
