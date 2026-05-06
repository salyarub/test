import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import Layout from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/axios'
import { toast } from 'sonner'
import {
    Calendar, Users, Clock, CheckCircle, AlertCircle, XCircle,
    Loader2, Play, UserCog, CalendarCheck, CalendarX,
    Shield, Bell, Settings, CalendarOff, Pencil
} from 'lucide-react'

const StatCard = ({ title, value, icon: Icon, color = "text-primary", bgColor = "bg-primary/10" }) => (
    <Card>
        <CardContent className="pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="text-3xl font-bold mt-1">{value}</p>
                </div>
                <div className={`h-12 w-12 rounded-full ${bgColor} flex items-center justify-center ${color}`}>
                    <Icon className="h-6 w-6" />
                </div>
            </div>
        </CardContent>
    </Card>
)

// Cancel Modal Component
const CancelModal = ({ isOpen, onClose, onConfirm, isRtl, isPending }) => {
    const [useCustomMessage, setUseCustomMessage] = useState(false)
    const [customMessage, setCustomMessage] = useState('')

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-bold mb-4">
                    {isRtl ? 'إلغاء الموعد' : 'Cancel Appointment'}
                </h3>

                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        {isRtl
                            ? 'سيتم إرسال رسالة للمريض لإعلامه بالإلغاء'
                            : 'A notification will be sent to the patient about the cancellation'}
                    </p>

                    <div className="space-y-3">
                        <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                            <input
                                type="radio"
                                name="messageType"
                                checked={!useCustomMessage}
                                onChange={() => setUseCustomMessage(false)}
                            />
                            <div>
                                <p className="font-medium">{isRtl ? 'رسالة اعتذار تلقائية' : 'Auto Apology Message'}</p>
                                <p className="text-xs text-muted-foreground">
                                    {isRtl ? 'نعتذر عن إلغاء موعدك...' : 'We apologize for cancelling your appointment...'}
                                </p>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                            <input
                                type="radio"
                                name="messageType"
                                checked={useCustomMessage}
                                onChange={() => setUseCustomMessage(true)}
                                className="mt-1"
                            />
                            <div className="flex-1">
                                <p className="font-medium">{isRtl ? 'رسالة مخصصة' : 'Custom Message'}</p>
                                {useCustomMessage && (
                                    <Input
                                        className="mt-2"
                                        placeholder={isRtl ? 'اكتب رسالتك للمريض...' : 'Write your message to patient...'}
                                        value={customMessage}
                                        onChange={(e) => setCustomMessage(e.target.value)}
                                    />
                                )}
                            </div>
                        </label>
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => onConfirm(useCustomMessage ? customMessage : '')}
                        disabled={isPending}
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRtl ? 'تأكيد الإلغاء' : 'Confirm Cancel')}
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        {isRtl ? 'إغلاق' : 'Close'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

const SecretaryDashboard = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const queryClient = useQueryClient()
    const [cancelModalOpen, setCancelModalOpen] = useState(false)
    const [selectedBookingId, setSelectedBookingId] = useState(null)
    const [walkinModalOpen, setWalkinModalOpen] = useState(false)
    const [walkinData, setWalkinData] = useState({ patient_name: '', patient_phone: '', notes: '' })
    const [editWalkinModalOpen, setEditWalkinModalOpen] = useState(false)
    const [editWalkinData, setEditWalkinData] = useState({ id: null, patient_name: '', patient_phone: '', notes: '' })

    // Fetch current user with permissions
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => (await api.get('auth/me/')).data
    })

    const permissions = user?.permissions || []
    const hasPermission = (perm) => permissions.includes(perm)

    // Fetch bookings - Real-time polling
    const { data: bookings, isLoading: bookingsLoading } = useQuery({
        queryKey: ['secretaryBookings'],
        queryFn: async () => (await api.get('clinic/bookings/')).data,
        enabled: hasPermission('manage_bookings') || hasPermission('patient_checkin'),
        refetchInterval: 5000,
    })

    // Fetch doctor profile for editing
    const { data: doctorProfile } = useQuery({
        queryKey: ['doctorProfile'],
        queryFn: async () => (await api.get('doctors/profile/')).data,
        enabled: hasPermission('edit_doctor_profile')
    })

    // Confirm booking
    const confirmMutation = useMutation({
        mutationFn: async (bookingId) => await api.post(`clinic/bookings/${bookingId}/confirm/`),
        onSuccess: () => {
            toast.success(isRtl ? 'تم تأكيد الموعد' : 'Booking confirmed!')
            queryClient.invalidateQueries(['secretaryBookings'])
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    // Start examination
    const startMutation = useMutation({
        mutationFn: async (bookingId) => await api.post(`clinic/bookings/${bookingId}/start_examination/`),
        onSuccess: () => {
            toast.success(isRtl ? 'بدأ الفحص' : 'Examination started')
            queryClient.invalidateQueries(['secretaryBookings'])
        },
        onError: (error) => toast.error(isRtl ? (error.response?.data?.error_ar || error.response?.data?.error) : (error.response?.data?.error || 'Failed'))
    })

    // Check if can start examination (only on booking date or after)
    const canStartExam = (booking) => {
        const bookingDate = new Date(booking.booking_datetime).setHours(0, 0, 0, 0)
        const today = new Date().setHours(0, 0, 0, 0)
        return today >= bookingDate && booking.status === 'CONFIRMED'
    }

    // Complete booking
    const completeMutation = useMutation({
        mutationFn: async (bookingId) => await api.post(`clinic/bookings/${bookingId}/complete/`),
        onSuccess: () => {
            toast.success(isRtl ? 'تم إكمال الموعد' : 'Appointment completed!')
            queryClient.invalidateQueries(['secretaryBookings'])
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    // Cancel booking
    const cancelMutation = useMutation({
        mutationFn: async ({ bookingId, message }) => await api.post(`clinic/bookings/${bookingId}/cancel/`, {
            message: message,
            auto_message: !message
        }),
        onSuccess: () => {
            toast.success(isRtl ? 'تم إلغاء الموعد' : 'Booking cancelled')
            queryClient.invalidateQueries(['secretaryBookings'])
            setCancelModalOpen(false)
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    // Add walk-in patient
    const walkinMutation = useMutation({
        mutationFn: async (data) => await api.post('clinic/bookings/add_walkin/', data),
        onSuccess: () => {
            toast.success(isRtl ? 'تمت إضافة المريض للانتظار' : 'Patient added to queue')
            queryClient.invalidateQueries(['secretaryBookings'])
            setWalkinModalOpen(false)
            setWalkinData({ patient_name: '', patient_phone: '', notes: '' })
        },
        onError: (error) => toast.error(isRtl ? (error.response?.data?.error_ar || error.response?.data?.error) : (error.response?.data?.error || 'Failed'))
    })

    const editWalkinMutation = useMutation({
        mutationFn: async (data) => {
            return await api.patch(`clinic/bookings/${data.id}/`, {
                walkin_patient_name: data.patient_name,
                walkin_patient_phone: data.patient_phone,
                patient_notes: data.notes
            })
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم تحديث البيانات' : 'Data updated!')
            queryClient.invalidateQueries(['secretaryBookings'])
            setEditWalkinModalOpen(false)
        },
        onError: (e) => toast.error(e.response?.data?.error_ar || e.response?.data?.error || 'Failed')
    })

    const handleCancelClick = (bookingId) => {
        setSelectedBookingId(bookingId)
        setCancelModalOpen(true)
    }

    const handleCancelConfirm = (message) => {
        cancelMutation.mutate({ bookingId: selectedBookingId, message })
    }

    const handleAddWalkin = () => {
        if (!walkinData.patient_name.trim()) {
            toast.error(isRtl ? 'اسم المريض مطلوب' : 'Patient name is required')
            return
        }
        walkinMutation.mutate(walkinData)
    }

    const pendingBookings = bookings?.filter(b => b.status === 'PENDING') || []
    const confirmedBookings = bookings?.filter(b => b.status === 'CONFIRMED') || []
    const inProgressBookings = bookings?.filter(b => b.status === 'IN_PROGRESS') || []
    const completedBookings = bookings?.filter(b => b.status === 'COMPLETED') || []

    const getBookingTypeBadge = (type) => {
        if (type === 'FOLLOWUP') {
            return <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">{isRtl ? 'مراجعة' : 'Follow-up'}</span>
        }
        return <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">{isRtl ? 'جديد' : 'New'}</span>
    }

    // Actions based on status and permissions
    const renderActions = (booking) => {
        const canManage = hasPermission('manage_bookings')
        const canCheckin = hasPermission('patient_checkin')

        switch (booking.status) {
            case 'PENDING':
                if (!canManage) return null
                return (
                    <>
                        {booking.is_walkin && (
                            <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20" onClick={() => {
                                setEditWalkinData({
                                    id: booking.id,
                                    patient_name: booking.walkin_patient_name || '',
                                    patient_phone: booking.walkin_patient_phone || '',
                                    notes: booking.doctor_notes || ''
                                })
                                setEditWalkinModalOpen(true)
                            }}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                        )}
                        <Button size="sm" className="gap-1" onClick={() => confirmMutation.mutate(booking.id)} disabled={confirmMutation.isPending}>
                            <CheckCircle className="h-3 w-3" />{isRtl ? 'تأكيد' : 'Confirm'}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => handleCancelClick(booking.id)}>
                            <XCircle className="h-3 w-3" />{isRtl ? 'إلغاء' : 'Cancel'}
                        </Button>
                    </>
                )
            case 'CONFIRMED':
                return (
                    <>
                        {canCheckin && (
                            <Button size="sm" className="gap-1 bg-purple-600 hover:bg-purple-700" onClick={() => startMutation.mutate(booking.id)} disabled={startMutation.isPending}>
                                <Play className="h-3 w-3" />{isRtl ? 'بدء الفحص' : 'Start'}
                            </Button>
                        )}
                        {canManage && (
                            <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => handleCancelClick(booking.id)}>
                                <XCircle className="h-3 w-3" />{isRtl ? 'إلغاء' : 'Cancel'}
                            </Button>
                        )}
                    </>
                )
            case 'IN_PROGRESS':
                if (!canCheckin) return null
                return (
                    <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => completeMutation.mutate(booking.id)} disabled={completeMutation.isPending}>
                        <CheckCircle className="h-3 w-3" />{isRtl ? 'اكتمل' : 'Complete'}
                    </Button>
                )
            default:
                return null
        }
    }

    return (
        <Layout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
                            <Shield className="h-8 w-8 text-cyan-600" />
                            {isRtl ? 'مرحباً،' : 'Welcome,'} {user?.first_name || 'Secretary'}
                        </h1>
                        <p className="text-muted-foreground mt-1">{isRtl ? 'لوحة تحكم السكرتير' : 'Secretary Dashboard'}</p>
                    </div>
                    {doctorProfile && bookings && (
                        <div className="flex items-center gap-4 bg-card p-3 rounded-lg border shadow-sm">
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                    {format(new Date(), 'EEEE, MMMM d', { locale: isRtl ? ar : undefined })}
                                </span>
                            </div>
                            <div className="h-4 w-px bg-border" />
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                    {bookings.filter(b => !['CANCELLED'].includes(b.status) && new Date(b.booking_datetime).toDateString() === new Date().toDateString()).length} / {doctorProfile.max_patients_per_session}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Permissions Overview */}
                <Card className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border-cyan-200 dark:border-cyan-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-cyan-800 dark:text-cyan-400">
                            <Shield className="h-5 w-5" />
                            {isRtl ? 'صلاحياتك' : 'Your Permissions'}
                        </CardTitle>
                        <CardDescription>{isRtl ? 'الإجراءات المتاحة لك' : 'Actions available to you'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {hasPermission('view_schedule') && (
                                <Badge className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-400 gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {isRtl ? 'عرض الجدول' : 'View Schedule'}
                                </Badge>
                            )}
                            {hasPermission('manage_schedule') && (
                                <Badge className="bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-400 gap-1">
                                    <Settings className="h-3 w-3" />
                                    {isRtl ? 'إدارة الجدول' : 'Manage Schedule'}
                                </Badge>
                            )}
                            {hasPermission('manage_bookings') && (
                                <Badge className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400 gap-1">
                                    <CalendarCheck className="h-3 w-3" />
                                    {isRtl ? 'إدارة الحجوزات' : 'Manage Bookings'}
                                </Badge>
                            )}
                            {hasPermission('patient_checkin') && (
                                <Badge className="bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-400 gap-1">
                                    <Play className="h-3 w-3" />
                                    {isRtl ? 'تسجيل دخول المرضى' : 'Patient Check-in'}
                                </Badge>
                            )}
                            {hasPermission('edit_doctor_profile') && (
                                <Badge className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-400 gap-1">
                                    <UserCog className="h-3 w-3" />
                                    {isRtl ? 'تعديل ملف الدكتور' : 'Edit Doctor Profile'}
                                </Badge>
                            )}
                            {hasPermission('add_walkin_patient') && (
                                <Badge className="bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-400 gap-1">
                                    <Users className="h-3 w-3" />
                                    {isRtl ? 'إضافة مريض للانتظار' : 'Add Walk-in Patient'}
                                </Badge>
                            )}
                            {hasPermission('manage_time_off') && (
                                <Badge className="bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-400 gap-1">
                                    <CalendarOff className="h-3 w-3" />
                                    {isRtl ? 'إدارة الإجازات' : 'Manage Time Off'}
                                </Badge>
                            )}
                            {permissions.length === 0 && (
                                <p className="text-muted-foreground text-sm">{isRtl ? 'لا توجد صلاحيات محددة' : 'No permissions assigned'}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions - Schedule Link */}
                {(hasPermission('view_schedule') || hasPermission('manage_bookings') || hasPermission('patient_checkin')) && (
                    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-indigo-800 dark:text-indigo-400">
                                <Calendar className="h-5 w-5" />
                                {isRtl ? 'جدول المواعيد' : 'Schedule Calendar'}
                            </CardTitle>
                            <CardDescription>{isRtl ? 'عرض وإدارة جدول مواعيد الطبيب' : 'View and manage the doctor\'s appointment calendar'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700" onClick={() => window.location.href = '/secretary/schedule'}>
                                <Calendar className="h-4 w-4" />
                                {isRtl ? 'فتح الجدول' : 'Open Schedule'}
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Stats - only show if has relevant permissions */}
                {(hasPermission('manage_bookings') || hasPermission('patient_checkin')) && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard title={isRtl ? "معلق" : "Pending"} value={pendingBookings.length} icon={Clock} color="text-yellow-600" bgColor="bg-yellow-100" />
                        <StatCard title={isRtl ? "مؤكد" : "Confirmed"} value={confirmedBookings.length} icon={CheckCircle} color="text-blue-600" bgColor="bg-blue-100" />
                        <StatCard title={isRtl ? "جاري الفحص" : "In Progress"} value={inProgressBookings.length} icon={Play} color="text-purple-600" bgColor="bg-purple-100" />
                        <StatCard title={isRtl ? "مكتمل اليوم" : "Completed Today"} value={completedBookings.length} icon={Users} color="text-green-600" bgColor="bg-green-100" />
                    </div>
                )}

                {/* Booking Management - only if has permission */}
                {hasPermission('manage_bookings') && pendingBookings.length > 0 && (
                    <Card className="border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
                                <Clock className="h-5 w-5" />{isRtl ? 'بانتظار الموافقة' : 'Awaiting Approval'}
                                <Badge variant="secondary" className="bg-yellow-200 text-yellow-800">{pendingBookings.length}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {pendingBookings.map(booking => (
                                <div key={booking.id} className="flex items-center justify-between p-4 bg-card rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-800">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{booking.patient_name || 'Patient'}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{format(new Date(booking.booking_datetime), 'PPP p')}</span>
                                                {getBookingTypeBadge(booking.booking_type)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">{renderActions(booking)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Confirmed Bookings */}
                {(hasPermission('manage_bookings') || hasPermission('patient_checkin')) && confirmedBookings.length > 0 && (
                    <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-400">
                                <CheckCircle className="h-5 w-5" />{isRtl ? 'المؤكدة' : 'Confirmed'}
                                <Badge variant="secondary" className="bg-blue-200 text-blue-800">{confirmedBookings.length}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {confirmedBookings.map(booking => (
                                <div key={booking.id} className="flex items-center justify-between p-4 bg-card rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-800">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{booking.patient_name || 'Patient'}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{format(new Date(booking.booking_datetime), 'PPP p')}</span>
                                                {getBookingTypeBadge(booking.booking_type)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">{renderActions(booking)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* In Progress */}
                {hasPermission('patient_checkin') && inProgressBookings.length > 0 && (
                    <Card className="border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-400">
                                <Play className="h-5 w-5" />{isRtl ? 'جاري الفحص' : 'In Progress'}
                                <Badge variant="secondary" className="bg-purple-200 text-purple-800">{inProgressBookings.length}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {inProgressBookings.map(booking => (
                                <div key={booking.id} className="flex items-center justify-between p-4 bg-card rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-800">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{booking.patient_name || 'Patient'}</p>
                                            <span className="text-sm text-muted-foreground">{format(new Date(booking.booking_datetime), 'p')}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">{renderActions(booking)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Edit Doctor Profile - only if has permission */}
                {hasPermission('edit_doctor_profile') && (
                    <Card className="border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-indigo-800 dark:text-indigo-400">
                                <UserCog className="h-5 w-5" />{isRtl ? 'تعديل ملف الدكتور' : 'Edit Doctor Profile'}
                            </CardTitle>
                            <CardDescription>{isRtl ? 'يمكنك تحديث معلومات الطبيب' : 'You can update doctor information'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button className="gap-2" onClick={() => window.location.href = '/profile'}>
                                <Settings className="h-4 w-4" />
                                {isRtl ? 'الذهاب لصفحة الملف الشخصي' : 'Go to Profile Page'}
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {bookingsLoading && (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {/* No permissions message */}
                {permissions.length === 0 && !bookingsLoading && (
                    <Card className="border-gray-200">
                        <CardContent className="p-12 text-center">
                            <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold">{isRtl ? 'لا توجد صلاحيات' : 'No Permissions Assigned'}</h3>
                            <p className="text-muted-foreground mt-2">
                                {isRtl ? 'تواصل مع الطبيب لمنحك الصلاحيات اللازمة' : 'Contact your doctor to grant you the necessary permissions'}
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Cancel Modal */}
            <CancelModal
                isOpen={cancelModalOpen}
                onClose={() => setCancelModalOpen(false)}
                onConfirm={handleCancelConfirm}
                isRtl={isRtl}
                isPending={cancelMutation.isPending}
            />

            {/* Walk-in Patient Modal */}
            {walkinModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Users className="h-5 w-5 text-orange-600" />
                            {isRtl ? 'إضافة مريض للانتظار' : 'Add Walk-in Patient'}
                        </h3>

                        <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded-lg mb-4 text-sm text-orange-800 dark:text-orange-400">
                            {isRtl ? 'سيتم إضافة المريض مباشرة كـ "مؤكد" في قائمة اليوم.' : 'Patient will be added directly as "Confirmed" to today\'s queue.'}
                        </div>

                        {/* Capacity Status */}
                        {doctorProfile && bookings && (
                            <div className={`p-3 rounded-lg mb-4 text-sm ${bookings.filter(b => !['CANCELLED'].includes(b.status) && new Date(b.booking_datetime).toDateString() === new Date().toDateString()).length >= doctorProfile.max_patients_per_session
                                ? (doctorProfile.allow_overbooking ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-red-50 text-red-800 border border-red-200')
                                : 'bg-green-50 text-green-800 border border-green-200'
                                }`}>
                                <div className="flex justify-between items-center font-medium">
                                    <span>{isRtl ? 'حالة الانتظار اليوم:' : 'Today\'s Queue Status:'}</span>
                                    <span>
                                        {bookings.filter(b => !['CANCELLED'].includes(b.status) && new Date(b.booking_datetime).toDateString() === new Date().toDateString()).length} / {doctorProfile.max_patients_per_session}
                                    </span>
                                </div>
                                {bookings.filter(b => !['CANCELLED'].includes(b.status) && new Date(b.booking_datetime).toDateString() === new Date().toDateString()).length >= doctorProfile.max_patients_per_session && (
                                    <div className="mt-1 text-xs">
                                        {doctorProfile.allow_overbooking
                                            ? (isRtl ? 'العدد ممتلئ، لكن الطبيب يسمح بالإضافة.' : 'Full, but doctor allows overbooking.')
                                            : (isRtl ? 'العدد ممتلئ. لا يمكن إضافة المزيد.' : 'Full. Cannot add more patients.')
                                        }
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <Label>{isRtl ? 'اسم المريض *' : 'Patient Name *'}</Label>
                                <Input
                                    value={walkinData.patient_name}
                                    onChange={(e) => setWalkinData({ ...walkinData, patient_name: e.target.value })}
                                    placeholder={isRtl ? 'أدخل اسم المريض' : 'Enter patient name'}
                                />
                            </div>
                            <div>
                                <Label>{isRtl ? 'رقم الهاتف (اختياري)' : 'Phone Number (Optional)'}</Label>
                                <Input
                                    value={walkinData.patient_phone}
                                    onChange={(e) => setWalkinData({ ...walkinData, patient_phone: e.target.value })}
                                    placeholder={isRtl ? 'رقم الهاتف' : 'Phone number'}
                                />
                            </div>
                            <div>
                                <Label>{isRtl ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}</Label>
                                <Input
                                    value={walkinData.notes}
                                    onChange={(e) => { if (e.target.value.length <= 50) setWalkinData({ ...walkinData, notes: e.target.value }) }}
                                    placeholder={isRtl ? 'أي ملاحظات إضافية' : 'Any additional notes'}
                                    maxLength={50}
                                />
                                <span className={`text-[11px] mt-0.5 block ${walkinData.notes.length >= 45 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                    {walkinData.notes.length}/50
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <Button
                                className="flex-1 bg-orange-600 hover:bg-orange-700"
                                onClick={handleAddWalkin}
                                disabled={walkinMutation.isPending}
                            >
                                {walkinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRtl ? 'إضافة للانتظار' : 'Add to Queue')}
                            </Button>
                            <Button variant="outline" onClick={() => setWalkinModalOpen(false)}>
                                {isRtl ? 'إلغاء' : 'Cancel'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Walk-in Modal */}
            {
                editWalkinModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-in zoom-in-95">
                            <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                {isRtl ? 'تعديل بيانات الحضور' : 'Edit Walk-in Patient'}
                            </h3>

                            <div className="space-y-3 mb-4">
                                <div>
                                    <Label className="text-sm font-semibold">{isRtl ? 'اسم المريض *' : 'Patient Name *'}</Label>
                                    <Input value={editWalkinData.patient_name} onChange={e => setEditWalkinData({ ...editWalkinData, patient_name: e.target.value })} className="mt-1 border-2 focus:ring-2 focus:ring-blue-400" />
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">{isRtl ? 'رقم الهاتف' : 'Phone'}</Label>
                                    <Input value={editWalkinData.patient_phone} onChange={e => setEditWalkinData({ ...editWalkinData, patient_phone: e.target.value })} className="mt-1 border-2" />
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <Label className="text-sm font-semibold">{isRtl ? 'ملاحظات' : 'Notes'}</Label>
                                        <span className={`text-xs ${editWalkinData.notes?.length > 50 ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                            {editWalkinData.notes?.length || 0}/50
                                        </span>
                                    </div>
                                    <textarea
                                        value={editWalkinData.notes}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val.length <= 50) {
                                                setEditWalkinData({ ...editWalkinData, notes: val });
                                            }
                                        }}
                                        className="w-full rounded-md border-2 border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                                        placeholder={isRtl ? "ملاحظات إضافية... (حد أقصى 50 حرف)" : "Additional notes... (max 50 chars)"}
                                    />
                                    {editWalkinData.notes?.length >= 50 && (
                                        <p className="text-xs text-red-500 mt-1">{isRtl ? 'تم الوصول للحد الأقصى' : 'Maximum limit reached'}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <Button
                                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                                    onClick={() => editWalkinMutation.mutate(editWalkinData)}
                                    disabled={editWalkinMutation.isPending || !editWalkinData.patient_name}
                                >
                                    {editWalkinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRtl ? 'حفظ' : 'Save')}
                                </Button>
                                <Button variant="outline" onClick={() => { setEditWalkinModalOpen(false); setEditWalkinData({ id: null, patient_name: '', patient_phone: '', notes: '' }); }}>
                                    {isRtl ? 'إلغاء' : 'Cancel'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }
        </Layout>
    )
}

export default SecretaryDashboard
