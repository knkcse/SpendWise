import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useStore } from '@/data/store'
import { useApplyTheme } from '@/hooks/useTheme'
import { Login, Splash } from '@/screens/Auth'
import Dashboard from '@/screens/Dashboard'
import Transactions from '@/screens/Transactions'
import TransactionForm from '@/screens/TransactionForm'
import TransactionDetails from '@/screens/TransactionDetails'
import ImportCSV from '@/screens/ImportCSV'
import Categories from '@/screens/Categories'
import { MonthlyReport, WeeklyReport } from '@/screens/Reports'
import Insights from '@/screens/Insights'
import Budgets from '@/screens/Budgets'
import Recurring from '@/screens/Recurring'
import DetectionSettings from '@/screens/DetectionSettings'
import Profile from '@/screens/Profile'

function RequireOnboarded({ children }: { children: ReactNode }) {
  const { ready, profile } = useStore()
  if (!ready) return null
  return profile.onboarded ? <>{children}</> : <Navigate to="/splash" replace />
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  useApplyTheme()
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/splash" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route element={<RequireOnboarded><AppShell /></RequireOnboarded>}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="insights" element={<Insights />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="/transactions/new" element={<RequireOnboarded><TransactionForm mode="add" /></RequireOnboarded>} />
        <Route path="/transactions/import" element={<RequireOnboarded><ImportCSV /></RequireOnboarded>} />
        <Route path="/transactions/:id" element={<RequireOnboarded><TransactionDetails /></RequireOnboarded>} />
        <Route path="/transactions/:id/edit" element={<RequireOnboarded><TransactionForm mode="edit" /></RequireOnboarded>} />
        <Route path="/categories" element={<RequireOnboarded><Categories /></RequireOnboarded>} />
        <Route path="/reports/weekly" element={<RequireOnboarded><WeeklyReport /></RequireOnboarded>} />
        <Route path="/reports/monthly" element={<RequireOnboarded><MonthlyReport /></RequireOnboarded>} />
        <Route path="/recurring" element={<RequireOnboarded><Recurring /></RequireOnboarded>} />
        <Route path="/settings/detection" element={<RequireOnboarded><DetectionSettings /></RequireOnboarded>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
