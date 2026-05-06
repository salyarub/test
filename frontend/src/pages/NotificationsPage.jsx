import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import Layout from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { Bell, Calendar, CheckCircle, AlertCircle, Info, Loader2, Check, X, Clock, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const NotificationsPage = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const queryClient = useQueryClient()

    // Track action states for each notification (optimistic UI)
    const [actionStates, setActionStates] = useState({})

    // Rejection modal state
    const [rejectModal, setRejectModal] = useState({ open: false, bookingId: null, notifId: null })
    const [rejectMode, setRejectMode] = useState('auto') // 'auto' or 'custom'
    const [customMessage, setCustomMessage] = useState('')

    // Fetch real notifications from API - Real-time polling
    const { data: notifications, isLoading, error } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const res = await api.get('notifications/')
            return res.data
        },
        refetchInterval: 5000,
    })

    // Mark all as read mutation
    const markAllMutation = useMutation({
        mutationFn: async () => {
            await api.post('notifications/mark-all-read/')
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications'])
            toast.success(isRtl ? 'تم تحديد الكل كمقروء' : 'All marked as read')
        }
    })

    // Mark single as read
    const markReadMutation = useMutation({
        mutationFn: async (notificationId) => {
            await api.post(`notifications/${notificationId}/read/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications'])
        }
    })

    // Confirm booking mutation
    const confirmMutation = useMutation({
        mutationFn: async ({ bookingId, notifId }) => {
            await api.post(`clinic/bookings/${bookingId}/confirm/`)
            return { bookingId, notifId }
        },
        onMutate: ({ notifId }) => {
            // Optimistic update - show loading state
            setActionStates(prev => ({ ...prev, [notifId]: 'confirming' }))
        },
        onSuccess: ({ notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'confirmed' }))
            toast.success(isRtl ? 'تم تأكيد الموعد' : 'Booking confirmed')
            queryClient.invalidateQueries(['notifications'])
        },
        onError: (error, { notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'error' }))
            toast.error(error.response?.data?.error || (isRtl ? 'حدث خطأ' : 'Error'))
        }
    })

    // Cancel booking mutation - supports both auto and custom message
    const cancelMutation = useMutation({
        mutationFn: async ({ bookingId, notifId, autoMessage, customMessage }) => {
            const payload = autoMessage ? { auto_message: true } : { message: customMessage }
            await api.post(`clinic/bookings/${bookingId}/cancel/`, payload)
            return { bookingId, notifId }
        },
        onMutate: ({ notifId }) => {
            // Optimistic update - show loading state
            setActionStates(prev => ({ ...prev, [notifId]: 'rejecting' }))
        },
        onSuccess: ({ notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'rejected' }))
            toast.success(isRtl ? 'تم رفض الموعد وإرسال الرسالة' : 'Booking rejected and message sent')
            queryClient.invalidateQueries(['notifications'])
            setRejectModal({ open: false, bookingId: null, notifId: null })
            setCustomMessage('')
            setRejectMode('auto')
        },
        onError: (error, { notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'error' }))
            toast.error(error.response?.data?.error || (isRtl ? 'حدث خطأ' : 'Error'))
        }
    })

    // Handle reject button click - open modal
    const handleRejectClick = (bookingId, notifId) => {
        setRejectModal({ open: true, bookingId, notifId })
        setRejectMode('auto')
        setCustomMessage('')
    }

    // Handle confirm rejection from modal
    const handleConfirmReject = () => {
        if (rejectMode === 'custom' && !customMessage.trim()) {
            toast.error(isRtl ? 'الرجاء كتابة رسالة' : 'Please write a message')
            return
        }
        cancelMutation.mutate({
            bookingId: rejectModal.bookingId,
            notifId: rejectModal.notifId,
            autoMessage: rejectMode === 'auto',
            customMessage: rejectMode === 'custom' ? customMessage : null
        })
    }

    // Reschedule accept mutation
    const rescheduleAcceptMutation = useMutation({
        mutationFn: async ({ rescheduleId, selectedSlot, notifId }) => {
            const res = await api.post(`scheduling/reschedule-requests/${rescheduleId}/accept/`, { selected_slot: selectedSlot })
            return { ...res.data, notifId }
        },
        onMutate: ({ notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'rescheduling' }))
        },
        onSuccess: (data, { notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'rescheduled' }))
            toast.success(isRtl ? 'تم تحويل حجزك بنجاح!' : 'Appointment rescheduled successfully!')
            queryClient.invalidateQueries(['notifications'])
        },
        onError: (error, { notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'error' }))
            toast.error(error.response?.data?.error_ar || error.response?.data?.error || (isRtl ? 'حدث خطأ' : 'Error'))
        }
    })

    // Reschedule reject mutation
    const rescheduleRejectMutation = useMutation({
        mutationFn: async ({ rescheduleId, notifId }) => {
            await api.delete(`scheduling/reschedule-requests/${rescheduleId}/accept/`)
            return { notifId }
        },
        onSuccess: ({ notifId }) => {
            setActionStates(prev => ({ ...prev, [notifId]: 'reschedule_rejected' }))
            toast.success(isRtl ? 'تم رفض إعادة الجدولة' : 'Reschedule rejected')
            queryClient.invalidateQueries(['notifications'])
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || (isRtl ? 'حدث خطأ' : 'Error'))
        }
    })

    // Render reschedule offer with slot buttons
    const renderRescheduleOffer = (notif) => {
        const state = actionStates[notif.id]
        const rescheduleData = notif.reschedule_data

        if (!rescheduleData) return null

        // Already handled
        if (state === 'rescheduled' || rescheduleData.status === 'ACCEPTED') {
            return (
                <div className="mt-3 pt-3 border-t border-border">
                    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {isRtl ? 'تم تحويل الحجز' : 'Rescheduled'}
                    </Badge>
                </div>
            )
        }

        if (state === 'reschedule_rejected' || rescheduleData.status === 'REJECTED') {
            return (
                <div className="mt-3 pt-3 border-t border-border">
                    <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 gap-1">
                        <X className="w-3 h-3" />
                        {isRtl ? 'تم رفض المواعيد' : 'Rejected'}
                    </Badge>
                </div>
            )
        }

        if (rescheduleData.is_expired || rescheduleData.status === 'EXPIRED') {
            return (
                <div className="mt-3 pt-3 border-t border-border">
                    <Badge variant="outline" className="text-orange-600 border-orange-300">
                        {isRtl ? 'انتهت صلاحية العرض' : 'Offer expired'}
                    </Badge>
                </div>
            )
        }

        if (state === 'rescheduling') {
            return (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{isRtl ? 'جاري تحويل الحجز...' : 'Rescheduling...'}</span>
                </div>
            )
        }

        const locale = isRtl ? ar : enUS

        return (
            <div className="mt-3 pt-3 border-t border-border space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                    {isRtl ? 'اختر أحد المواعيد البديلة:' : 'Choose an alternative slot:'}
                </p>

                <div className="grid gap-2">
                    {rescheduleData.suggested_slots.map((slot, index) => {
                        const slotDate = new Date(slot)
                        const dayName = format(slotDate, 'EEEE', { locale })
                        const dateStr = format(slotDate, 'yyyy-MM-dd')
                        const timeStr = format(slotDate, 'HH:mm')

                        return (
                            <Button
                                key={index}
                                variant="outline"
                                className="w-full justify-between h-auto py-3 px-4 text-left border-2 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0"
                                onClick={() => rescheduleAcceptMutation.mutate({
                                    rescheduleId: rescheduleData.id,
                                    selectedSlot: slot,
                                    notifId: notif.id
                                })}
                                disabled={rescheduleAcceptMutation.isPending || rescheduleRejectMutation.isPending}
                            >
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Calendar className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">{dayName}</p>
                                        <p className="text-sm text-muted-foreground">{dateStr}</p>
                                    </div>
                                </div>
                                <div className="text-left sm:text-right w-full sm:w-auto pl-[52px] sm:pl-0">
                                    <p className="font-bold text-primary text-lg">{timeStr}</p>
                                </div>
                            </Button>
                        )
                    })}
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-destructive"
                    onClick={() => rescheduleRejectMutation.mutate({
                        rescheduleId: rescheduleData.id,
                        notifId: notif.id
                    })}
                    disabled={rescheduleAcceptMutation.isPending || rescheduleRejectMutation.isPending}
                >
                    <X className="w-4 h-4 mr-2" />
                    {isRtl ? 'رفض جميع المواعيد' : 'Reject all slots'}
                </Button>
            </div>
        )
    }

    const formatNotificationDate = (dateString) => {
        const date = new Date(dateString)
        if (isToday(date)) {
            return `${isRtl ? 'اليوم' : 'Today'} ${format(date, 'HH:mm')}`
        }
        if (isYesterday(date)) {
            return `${isRtl ? 'أمس' : 'Yesterday'} ${format(date, 'HH:mm')}`
        }
        return format(date, 'yyyy-MM-dd HH:mm')
    }

    const getIcon = (type) => {
        switch (type) {
            case 'NEW_BOOKING':
            case 'BOOKING_CREATED':
            case 'BOOKING_CONFIRMED':
                return Calendar
            case 'RESCHEDULE_OFFER':
                return Clock
            case 'REMINDER':
                return AlertCircle
            default:
                return Info
        }
    }

    const getNotificationTypeLabel = (type) => {
        if (!type) return ''
        if (isRtl) {
            switch (type) {
                case 'NEW_DOCTOR': return 'طبيب جديد'
                case 'DOCUMENT_REUPLOAD': return 'إعادة رفع وثيقة'
                case 'NEW_BOOKING': return 'حجز جديد'
                case 'BOOKING_CREATED': return 'إنشاء حجز'
                case 'BOOKING_CONFIRMED': return 'تأكيد الحجز'
                case 'RESCHEDULE_OFFER': return 'تغيير موعد'
                case 'REMINDER': return 'تذكير'
                default: return type.replace(/_/g, ' ')
            }
        }
        return type.replace(/_/g, ' ')
    }

    const getLocalizedMessage = (notif) => {
        const msg = notif.message
        if (!isRtl) return msg

        if (notif.notification_type === 'NEW_DOCTOR' && msg.startsWith('New Doctor Registration: ')) {
            const name = msg.replace('New Doctor Registration: ', '')
            return `تسجيل طبيب جديد: ${name}`
        }

        if (notif.notification_type === 'DOCUMENT_REUPLOAD' && msg.startsWith('Document Re-upload: ')) {
            const namePart = msg.replace('Document Re-upload: ', '').replace(' uploaded a new license document.', '')
            return `قام ${namePart} برفع وثيقة طبية جديدة.`
        }

        return msg
    }

    // Render action status or buttons
    const renderActionArea = (notif) => {
        const state = actionStates[notif.id]

        // If action was taken, show result
        if (state === 'confirmed') {
            return (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                    <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {isRtl ? 'مؤكد' : 'Confirmed'}
                    </Badge>
                </div>
            )
        }

        if (state === 'rejected') {
            return (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                    <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 gap-1">
                        <X className="w-3 h-3" />
                        {isRtl ? 'تم الرفض' : 'Rejected'}
                    </Badge>
                </div>
            )
        }

        if (state === 'confirming' || state === 'rejecting') {
            return (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">
                        {state === 'confirming' ? (isRtl ? 'جاري التأكيد...' : 'Confirming...') : (isRtl ? 'جاري الرفض...' : 'Rejecting...')}
                    </span>
                </div>
            )
        }

        if (state === 'error') {
            return (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                    <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {isRtl ? 'حدث خطأ' : 'Error occurred'}
                    </Badge>
                </div>
            )
        }

        // Show buttons only for NEW_BOOKING with related_object_id and booking is still PENDING
        if (notif.related_object_id && notif.notification_type === 'NEW_BOOKING') {
            // Check if booking is still pending (from backend)
            if (notif.related_booking_status && notif.related_booking_status !== 'PENDING') {
                // Booking already handled - show the current status
                const statusConfig = {
                    'CONFIRMED': { label: isRtl ? 'مؤكد' : 'Confirmed', icon: CheckCircle, className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700' },
                    'CANCELLED': { label: isRtl ? 'تم الرفض' : 'Rejected', icon: X, className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700' },
                    'IN_PROGRESS': { label: isRtl ? 'جاري الفحص' : 'In Progress', icon: Clock, className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700' },
                    'COMPLETED': { label: isRtl ? 'مكتمل' : 'Completed', icon: CheckCircle, className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700' },
                }
                const config = statusConfig[notif.related_booking_status]
                if (config) {
                    const StatusIcon = config.icon
                    return (
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                            <Badge className={`${config.className} gap-1`}>
                                <StatusIcon className="w-3 h-3" />
                                {config.label}
                            </Badge>
                        </div>
                    )
                }
            }

            // Booking is still pending - show action buttons
            return (
                <div className="flex gap-2 mt-3 pt-2 border-t border-border">
                    <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 h-8 text-xs"
                        onClick={(e) => {
                            e.stopPropagation()
                            confirmMutation.mutate({ bookingId: notif.related_object_id, notifId: notif.id })
                        }}
                        disabled={confirmMutation.isPending || cancelMutation.isPending}
                    >
                        <Check className="w-3 h-3 mr-1.5" />
                        {isRtl ? 'قبول' : 'Accept'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 h-8 text-xs"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleRejectClick(notif.related_object_id, notif.id)
                        }}
                        disabled={confirmMutation.isPending || cancelMutation.isPending}
                    >
                        <X className="w-3 h-3 mr-1.5" />
                        {isRtl ? 'رفض' : 'Reject'}
                    </Button>
                </div>
            )
        }

        // Handle RESCHEDULE_OFFER notifications
        if (notif.notification_type === 'RESCHEDULE_OFFER') {
            return renderRescheduleOffer(notif)
        }

        return null
    }

    const unreadCount = notifications?.filter(n => !n.is_read).length || 0

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-4 sm:space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold">{isRtl ? 'الإشعارات' : 'Notifications'}</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            {isRtl ? 'آخر التحديثات والتنبيهات' : 'Latest updates and alerts'}
                            {unreadCount > 0 && (
                                <span className="ml-2 text-primary font-medium">
                                    ({unreadCount} {isRtl ? 'غير مقروء' : 'unread'})
                                </span>
                            )}
                        </p>
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markAllMutation.mutate()}
                            disabled={markAllMutation.isPending}
                        >
                            {isRtl ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                        </Button>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : error ? (
                    <Card>
                        <CardContent className="py-12 text-center text-destructive">
                            <p>{isRtl ? 'حدث خطأ في تحميل الإشعارات' : 'Error loading notifications'}</p>
                        </CardContent>
                    </Card>
                ) : !notifications || notifications.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>{isRtl ? 'لا توجد إشعارات' : 'No notifications yet'}</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {notifications.map(notif => {
                            const Icon = getIcon(notif.notification_type)
                            return (
                                <Card
                                    key={notif.id}
                                    className={`cursor-pointer hover:shadow-md transition-shadow ${!notif.is_read ? 'border-l-4 border-l-primary bg-primary/5' : ''}`}
                                    onClick={() => {
                                        if (!notif.is_read) {
                                            markReadMutation.mutate(notif.id)
                                        }
                                    }}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-start gap-4">
                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${!notif.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${!notif.is_read ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                        {getNotificationTypeLabel(notif.notification_type)}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground" title={format(new Date(notif.created_at), 'yyyy-MM-dd HH:mm:ss')}>
                                                        {formatNotificationDate(notif.created_at)}
                                                    </span>
                                                </div>
                                                <p className={`text-sm mt-2 ${!notif.is_read ? 'font-medium' : 'text-muted-foreground'}`}>
                                                    {getLocalizedMessage(notif)}
                                                </p>

                                                {/* Action Buttons or Status */}
                                                {renderActionArea(notif)}
                                            </div>
                                            {!notif.is_read && (
                                                <div className="h-2 w-2 rounded-full bg-primary mt-2"></div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Rejection Modal */}
            {rejectModal.open && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setRejectModal({ open: false, bookingId: null, notifId: null })}>
                    <div className="bg-background rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <MessageSquare className="h-5 w-5 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">{isRtl ? 'رفض الحجز' : 'Reject Booking'}</h3>
                                <p className="text-sm text-muted-foreground">{isRtl ? 'اختر نوع الرسالة' : 'Choose message type'}</p>
                            </div>
                        </div>

                        {/* Message Type Selection */}
                        <div className="space-y-3 mb-4">
                            {/* Auto Message Option */}
                            <label
                                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${rejectMode === 'auto' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'}`}
                                onClick={() => setRejectMode('auto')}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${rejectMode === 'auto' ? 'border-primary' : 'border-muted-foreground'}`}>
                                    {rejectMode === 'auto' && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium">{isRtl ? 'رسالة اعتذار تلقائية' : 'Automatic apology message'}</p>
                                    <p className="text-xs text-muted-foreground">{isRtl ? 'سيرسل النظام رسالة اعتذار جاهزة' : 'System will send a pre-written apology'}</p>
                                </div>
                            </label>

                            {/* Custom Message Option */}
                            <label
                                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${rejectMode === 'custom' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'}`}
                                onClick={() => setRejectMode('custom')}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 ${rejectMode === 'custom' ? 'border-primary' : 'border-muted-foreground'}`}>
                                    {rejectMode === 'custom' && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium">{isRtl ? 'رسالة مخصصة' : 'Custom message'}</p>
                                    <p className="text-xs text-muted-foreground mb-2">{isRtl ? 'اكتب رسالتك الخاصة للمريض' : 'Write your own message to the patient'}</p>
                                    {rejectMode === 'custom' && (
                                        <textarea
                                            className="w-full p-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                                            rows={3}
                                            placeholder={isRtl ? 'اكتب رسالتك هنا...' : 'Write your message here...'}
                                            value={customMessage}
                                            onChange={(e) => setCustomMessage(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    )}
                                </div>
                            </label>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setRejectModal({ open: false, bookingId: null, notifId: null })}>
                                {isRtl ? 'إلغاء' : 'Cancel'}
                            </Button>
                            <Button
                                className="bg-red-600 hover:bg-red-700"
                                onClick={handleConfirmReject}
                                disabled={cancelMutation.isPending}
                            >
                                {cancelMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <X className="h-4 w-4 mr-2" />
                                )}
                                {isRtl ? 'تأكيد الرفض' : 'Confirm Rejection'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    )
}

export default NotificationsPage

