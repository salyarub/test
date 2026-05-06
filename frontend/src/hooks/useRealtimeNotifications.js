import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import api from '@/lib/axios'

const POLL_INTERVAL = 5000 // 5 seconds

// ── Module-level singleton tracking (shared across ALL hook instances) ──
// This prevents duplicate toasts when the hook is used in multiple components
let prevNotifIds = null  // null = first load, Set = loaded
let toastLock = false     // Prevent race conditions between instances

/**
 * Shared hook for real-time notification polling.
 * - Polls every 5 seconds for new notifications
 * - Shows a toast when a NEW notification arrives (only once, even if used in multiple components)
 * - Returns unread count and notifications data
 */
export const useRealtimeNotifications = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const queryClient = useQueryClient()
    const token = localStorage.getItem('access_token')

    const { data: notifications } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const res = await api.get('notifications/')
            return res.data
        },
        refetchInterval: POLL_INTERVAL,
        refetchIntervalInBackground: false,
        enabled: !!token,
        staleTime: 0,
    })

    const unreadCount = notifications?.filter(n => !n.is_read).length || 0

    // Detect new notifications and show toast (singleton — only first hook instance processes)
    useEffect(() => {
        if (!notifications || notifications.length === 0) return
        if (toastLock) return // Another instance is already processing

        toastLock = true

        try {
            const currentIds = new Set(notifications.map(n => n.id))

            // First load — just store IDs, don't toast
            if (prevNotifIds === null) {
                prevNotifIds = currentIds
                return
            }

            // Find truly new notifications
            const newNotifs = notifications.filter(n => !prevNotifIds.has(n.id))

            if (newNotifs.length > 0) {
                // Show toast for each new notification (max 3)
                newNotifs.slice(0, 3).forEach(notif => {
                    const icon = getNotifIcon(notif.notification_type)
                    toast(notif.message, {
                        icon,
                        duration: 6000,
                        position: 'top-center',
                    })
                })

                if (newNotifs.length > 3) {
                    toast.info(
                        isRtl
                            ? `و ${newNotifs.length - 3} إشعارات أخرى`
                            : `And ${newNotifs.length - 3} more notifications`,
                        { duration: 4000 }
                    )
                }

                // Invalidate booking queries so dashboards update
                queryClient.invalidateQueries({ queryKey: ['doctorBookings'] })
                queryClient.invalidateQueries({ queryKey: ['scheduleBookings'] })
                queryClient.invalidateQueries({ queryKey: ['secretaryBookings'] })
                queryClient.invalidateQueries({ queryKey: ['myBookings'] })
                queryClient.invalidateQueries({ queryKey: ['myBookingsWithDoctor'] })
            }

            prevNotifIds = currentIds
        } finally {
            toastLock = false
        }
    }, [notifications])

    return { notifications, unreadCount }
}

// Reset tracking on logout (call this when user logs out)
export const resetNotificationTracking = () => {
    prevNotifIds = null
    toastLock = false
}

function getNotifIcon(type) {
    switch (type) {
        case 'NEW_BOOKING':
        case 'BOOKING_CREATED':
            return '📅'
        case 'BOOKING_CONFIRMED':
            return '✅'
        case 'RESCHEDULE_OFFER':
            return '🔄'
        case 'REMINDER':
            return '⏰'
        case 'CANCELLED':
        case 'BOOKING_CANCELLED':
            return '❌'
        case 'APPOINTMENT_COMPLETED':
            return '✅'
        default:
            return '🔔'
    }
}

export default useRealtimeNotifications
