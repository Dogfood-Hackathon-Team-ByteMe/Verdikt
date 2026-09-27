/**
 * Route table.
 *
 * The landing page keeps its in-page anchors (#about, #gallery...), so it must
 * stay at "/" and those hashes must keep working -- BrowserRouter leaves them
 * alone. `#ui-kit` predates the router and is still honoured, in Landing.
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import EventEditor from './pages/EventEditor'
import EventsPage from './pages/EventsPage'
import InvitePage from './pages/InvitePage'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import OrganizerHome from './pages/OrganizerHome'
import ProjectDetail from './pages/ProjectDetail'
import ProfilePage from './pages/ProfilePage'
import ProjectsPage from './pages/ProjectsPage'
import SubmitProject from './pages/SubmitProject'
import TeamPage from './pages/TeamPage'

export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/projects/:id" element={<ProjectDetail />} />
      <Route path="/login" element={<AuthPage mode="signin" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />

      {/* The invite preview is public on purpose: you should be able to see
          which team invited you before deciding to make an account. */}
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* Signed in */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/teams/:id"
        element={
          <RequireAuth>
            <TeamPage />
          </RequireAuth>
        }
      />
      {/* Organizer. The guard is RequireAuth, not RequireRole: which events
          you organise is per-event, and the editor itself 403s from the API if
          you open one that is not yours. */}
      <Route
        path="/organizer"
        element={
          <RequireAuth>
            <OrganizerHome />
          </RequireAuth>
        }
      />
      <Route
        path="/organizer/events/:id"
        element={
          <RequireAuth>
            <EventEditor />
          </RequireAuth>
        }
      />
      <Route
        path="/projects/:id/edit"
        element={
          <RequireAuth>
            <SubmitProject />
          </RequireAuth>
        }
      />

      {/* Old links people may have bookmarked. /gallery is now /projects. */}
      <Route path="/signin" element={<Navigate to="/login" replace />} />
      <Route path="/gallery" element={<Navigate to="/projects" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
