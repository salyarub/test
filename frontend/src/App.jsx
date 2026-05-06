import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import Layout from '@/components/layout/Layout'
import ProtectedRoute, { DoctorRoute, PatientRoute, SecretaryRoute, AdminRoute } from '@/components/ProtectedRoute'

// Code Splitting - Public Pages
const LandingPage = React.lazy(() => import('@/pages/LandingPage'))
const LoginPage = React.lazy(() => import('@/pages/LoginPage'))
const RegisterPage = React.lazy(() => import('@/pages/RegisterPage'))
const AdminDashboard = React.lazy(() => import('@/pages/AdminDashboard'))
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'))

// Auth Flows
const VerifyEmailPage = React.lazy(() => import('@/pages/VerifyEmailPage'))
const ForgotPasswordPage = React.lazy(() => import('@/pages/ForgotPasswordPage'))
const ResetPasswordPage = React.lazy(() => import('@/pages/ResetPasswordPage'))
const UnverifiedAccountPage = React.lazy(() => import('@/pages/UnverifiedAccountPage'))

// Protected Pages - Patient Only
const PatientDashboard = React.lazy(() => import('@/features/patient/pages/PatientDashboard'))
const DoctorBookingPage = React.lazy(() => import('@/features/patient/pages/DoctorBookingPage'))
const MyBookingsPage = React.lazy(() => import('@/pages/MyBookingsPage'))

// Protected Pages - Doctor Only
const DoctorDashboard = React.lazy(() => import('@/features/scheduling/pages/DoctorDashboard'))
const DoctorAvailabilityPage = React.lazy(() => import('@/features/scheduling/pages/DoctorAvailabilityPage'))
const DoctorRatingsPage = React.lazy(() => import('@/features/scheduling/pages/DoctorRatingsPage'))
const DoctorProfilePage = React.lazy(() => import('@/features/scheduling/pages/DoctorProfilePage'))
const ScheduleCalendarPage = React.lazy(() => import('@/features/scheduling/pages/ScheduleCalendarPage'))
const StaffManagementPage = React.lazy(() => import('@/features/staff/pages/StaffManagementPage'))
const ActivityLogPage = React.lazy(() => import('@/features/reporting/pages/ActivityLogPage'))

// Protected Pages - Secretary Only
const SecretaryDashboard = React.lazy(() => import('@/features/secretary/pages/SecretaryDashboard'))
const SecretarySchedulePage = React.lazy(() => import('@/features/secretary/pages/SecretarySchedulePage'))

// Protected Pages - Both Roles
const ProfilePage = React.lazy(() => import('@/pages/ProfilePage'))
const RatingsPage = React.lazy(() => import('@/pages/RatingsPage'))
const NotificationsPage = React.lazy(() => import('@/pages/NotificationsPage'))

// Public Token-based
const ReschedulePage = React.lazy(() => import('@/features/rescheduling/pages/ReschedulePage'))

const LoadingFallback = () => (
    <Layout>
        <div className="flex h-[80vh] items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    </Layout>
)

function App() {
    return (
        <>
            <Suspense fallback={<LoadingFallback />}>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/unverified-account" element={<UnverifiedAccountPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/reschedule/:token" element={<ReschedulePage />} />

                    {/* Patient ONLY Routes */}
                    <Route path="/patient" element={
                        <PatientRoute><PatientDashboard /></PatientRoute>
                    } />
                    <Route path="/doctor/:doctorId/book" element={
                        <PatientRoute><DoctorBookingPage /></PatientRoute>
                    } />
                    <Route path="/my-bookings" element={
                        <PatientRoute><MyBookingsPage /></PatientRoute>
                    } />

                    {/* Doctor ONLY Routes */}
                    <Route path="/doctor" element={
                        <DoctorRoute><DoctorDashboard /></DoctorRoute>
                    } />
                    <Route path="/doctor/availability" element={
                        <DoctorRoute><DoctorAvailabilityPage /></DoctorRoute>
                    } />
                    <Route path="/doctor/ratings" element={
                        <DoctorRoute><DoctorRatingsPage /></DoctorRoute>
                    } />
                    <Route path="/doctor/profile" element={
                        <DoctorRoute><DoctorProfilePage /></DoctorRoute>
                    } />
                    <Route path="/doctor/staff" element={
                        <DoctorRoute><StaffManagementPage /></DoctorRoute>
                    } />
                    <Route path="/doctor/logs" element={
                        <DoctorRoute><ActivityLogPage /></DoctorRoute>
                    } />
                    <Route path="/doctor/schedule" element={
                        <DoctorRoute><ScheduleCalendarPage /></DoctorRoute>
                    } />

                    {/* Secretary ONLY Routes */}
                    <Route path="/secretary" element={
                        <SecretaryRoute><SecretaryDashboard /></SecretaryRoute>
                    } />
                    <Route path="/secretary/schedule" element={
                        <SecretaryRoute><SecretarySchedulePage /></SecretaryRoute>
                    } />

                    {/* Shared Protected Routes (Both Roles) */}
                    <Route path="/profile" element={
                        <ProtectedRoute><ProfilePage /></ProtectedRoute>
                    } />
                    <Route path="/ratings" element={
                        <ProtectedRoute><RatingsPage /></ProtectedRoute>
                    } />
                    <Route path="/notifications" element={
                        <ProtectedRoute><NotificationsPage /></ProtectedRoute>
                    } />

                    {/* Admin Route */}
                    <Route path="/admin" element={
                        <AdminRoute><AdminDashboard /></AdminRoute>
                    } />

                    {/* Catch-all 404 Route */}
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </Suspense>
            <Toaster position="top-center" richColors />
        </>
    )
}

export default App
