import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications'
import {
    LayoutDashboard,
    Calendar,
    Clock,
    Star,
    Bell,
    Users,
    Activity,
    User,
    Search,
    Shield
} from 'lucide-react'

const MobileNav = () => {
    const { i18n } = useTranslation()
    const location = useLocation()
    const isRtl = i18n.language === 'ar'
    const token = localStorage.getItem('access_token')
    const isActive = (path) => location.pathname === path

    // Use context auth
    const { user } = useAuth()
    const { unreadCount } = useRealtimeNotifications()

    if (!token) return null

    const isDoctor = user?.role === 'DOCTOR'
    const isPatient = user?.role === 'PATIENT'
    const isSecretary = user?.role === 'SECRETARY'
    const isAdmin = user?.role === 'ADMIN'
    const permissions = user?.permissions || []

    const getNavItems = () => {
        // Admin navigation - exclusive to admin only
        if (isAdmin) {
            return [
                { path: '/admin', icon: Shield, label: isRtl ? 'لوحة التحكم' : 'Dashboard' },
            ]
        }
        if (isDoctor) {
            return [
                { path: '/doctor', icon: LayoutDashboard, label: isRtl ? 'الرئيسية' : 'Home' },
                { path: '/doctor/schedule', icon: Calendar, label: isRtl ? 'الجدول' : 'Calendar' },
                { path: '/notifications', icon: Bell, label: isRtl ? 'الإشعارات' : 'Notify' },
                { path: '/doctor/profile', icon: User, label: isRtl ? 'حسابي' : 'Profile' },
            ]
        }
        if (isSecretary) {
            const secretaryNav = [
                { path: '/secretary', icon: LayoutDashboard, label: isRtl ? 'الرئيسية' : 'Home' },
            ]
            if (permissions.includes('view_schedule') || permissions.includes('manage_bookings')) {
                secretaryNav.push({ path: '/secretary/schedule', icon: Calendar, label: isRtl ? 'الجدول' : 'Schedule' })
            }
            if (permissions.includes('receive_notifications')) {
                secretaryNav.push({ path: '/notifications', icon: Bell, label: isRtl ? 'الإشعارات' : 'Notify' })
            }
            secretaryNav.push({ path: '/profile', icon: User, label: isRtl ? 'حسابي' : 'Profile' })
            return secretaryNav
        }
        // Patient
        return [
            { path: '/patient', icon: Search, label: isRtl ? 'بحث' : 'Search' },
            { path: '/my-bookings', icon: Calendar, label: isRtl ? 'حجوزاتي' : 'Bookings' },
            { path: '/notifications', icon: Bell, label: isRtl ? 'تنبيهات' : 'Notify' },
            { path: '/profile', icon: User, label: isRtl ? 'حسابي' : 'Profile' },
        ]
    }

    const navItems = getNavItems()

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 pb-safe">
            <div className="flex justify-around items-center h-16">
                {navItems.map((item) => {
                    const active = isActive(item.path)
                    const isNotifIcon = item.icon === Bell
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-200 relative
                                ${active
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100'}`}
                        >
                            <div className={`p-1.5 rounded-full transition-all ${active ? 'bg-primary/10 scale-110' : ''}`}>
                                <item.icon className={`h-5 w-5 ${active ? 'fill-current' : ''}`} strokeWidth={active ? 2.5 : 2} />
                            </div>
                            <span className="text-[10px] font-medium">{item.label}</span>
                            {isNotifIcon && unreadCount > 0 && (
                                <span className="absolute top-1 right-1/2 translate-x-3 h-4 w-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow-lg">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}

export default MobileNav
