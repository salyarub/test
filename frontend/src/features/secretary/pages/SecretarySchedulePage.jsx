import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isBefore, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import Layout from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/axios'
import { toast } from 'sonner'
import {
    Calendar, ChevronLeft, ChevronRight, Users, Clock, CheckCircle, XCircle,
    Loader2, Play, UserPlus, Sparkles, AlertTriangle, Info, Lock, Shield, Phone, FileText, Pencil
} from 'lucide-react'

const SecretarySchedulePage = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const locale = isRtl ? ar : enUS
    const queryClient = useQueryClient()

    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [walkinModal, setWalkinModal] = useState(false)
    const [walkinData, setWalkinData] = useState({ patient_name: '', patient_phone: '', notes: '', selected_time: null })
    const [editWalkinModalOpen, setEditWalkinModalOpen] = useState(false)
    const [editWalkinData, setEditWalkinData] = useState({ id: null, patient_name: '', patient_phone: '', notes: '' })
    const [emergencyModal, setEmergencyModal] = useState(false)
    const [emergencyData, setEmergencyData] = useState({
        start_date: new Date(),
        end_date: new Date(),
        reason: '',
        expiry_fraction: 'HALF'
    })

    // Fetch current user with permissions
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => (await api.get('auth/me/')).data,
        staleTime: 10 * 60 * 1000,
    })

    const permissions = user?.permissions || []
    const hasPermission = (perm) => permissions.includes(perm)

    // Permission checks - same actions as doctor, controlled via permissions
    const canViewSchedule = hasPermission('view_schedule') || hasPermission('manage_bookings') || hasPermission('patient_checkin')
    const canManageBookings = hasPermission('manage_bookings')
    const canCheckin = hasPermission('patient_checkin')
    const canAddWalkin = hasPermission('add_walkin_patient')
    const canManageSchedule = hasPermission('manage_schedule')
    const canManageTimeOff = hasPermission('manage_time_off')

    // Fetch doctor profile via secretary-specific endpoint
    const { data: doctorProfile, isLoading: profileLoading } = useQuery({
        queryKey: ['secretaryDoctorProfile'],
        queryFn: async () => (await api.get('secretary/doctor-profile/')).data,
        enabled: canViewSchedule,
        staleTime: 5 * 60 * 1000,
    })

    const { data: bookings, isLoading: bookingsLoading } = useQuery({
        queryKey: ['scheduleBookings'],
        queryFn: async () => (await api.get('clinic/bookings/')).data,
        enabled: canViewSchedule,
        refetchInterval: 5000,
        staleTime: 0,
    })

    const { data: daySlots, isLoading: slotsLoading } = useQuery({
        queryKey: ['daySlots', format(selectedDate, 'yyyy-MM-dd')],
        queryFn: async () => (await api.get(`scheduling/day-slots/?date=${format(selectedDate, 'yyyy-MM-dd')}`)).data,
        enabled: walkinModal,
        staleTime: 30000,
    })

    const { data: leaves, isLoading: leavesLoading } = useQuery({
        queryKey: ['activeLeaves'],
        queryFn: async () => (await api.get('scheduling/time-off/')).data,
        enabled: canViewSchedule,
        staleTime: 0
    })

    const viewMode = doctorProfile?.preferred_calendar_view || 'WEEKLY'
    const capacityByDay = doctorProfile?.capacity_by_day || {}
    const allowOverbooking = doctorProfile?.allow_overbooking || false

    const getCapacityForDate = (date) => {
        const dayOfWeek = date.getDay()
        return capacityByDay[String(dayOfWeek)] || 0
    }

    const selectedDateCapacity = getCapacityForDate(selectedDate)

    const dateRange = useMemo(() => {
        if (viewMode === 'WEEKLY') {
            const start = startOfWeek(currentDate, { weekStartsOn: 0 })
            const end = endOfWeek(currentDate, { weekStartsOn: 0 })
            return eachDayOfInterval({ start, end })
        } else {
            const start = startOfMonth(currentDate)
            const end = endOfMonth(currentDate)
            return eachDayOfInterval({ start, end })
        }
    }, [currentDate, viewMode])

    const bookingsByDate = useMemo(() => {
        if (!bookings) return {}
        const grouped = {}
        bookings.forEach(booking => {
            const dateKey = format(new Date(booking.booking_datetime), 'yyyy-MM-dd')
            if (!grouped[dateKey]) grouped[dateKey] = []
            grouped[dateKey].push(booking)
        })
        Object.keys(grouped).forEach(key => {
            grouped[key].sort((a, b) => {
                const aCancelled = a.status === 'CANCELLED'
                const bCancelled = b.status === 'CANCELLED'
                
                if (aCancelled && !bCancelled) return 1
                if (!aCancelled && bCancelled) return -1
                
                return new Date(a.booking_datetime) - new Date(b.booking_datetime)
            })
        })
        return grouped
    }, [bookings])

    const selectedDateBookings = useMemo(() => {
        const dateKey = format(selectedDate, 'yyyy-MM-dd')
        return bookingsByDate[dateKey] || []
    }, [selectedDate, bookingsByDate])

    const getBookingsForDate = (date) => {
        const dateKey = format(date, 'yyyy-MM-dd')
        return bookingsByDate[dateKey] || []
    }

    // SAME mutations as doctor page
    const confirmMutation = useMutation({
        mutationFn: async (id) => await api.post(`clinic/bookings/${id}/confirm/`),
        onSuccess: () => {
            toast.success(isRtl ? 'تم تأكيد الموعد' : 'Confirmed!')
            queryClient.invalidateQueries(['scheduleBookings'])
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Failed')
    })

    const startMutation = useMutation({
        mutationFn: async (id) => await api.post(`clinic/bookings/${id}/start_examination/`),
        onSuccess: () => {
            toast.success(isRtl ? 'بدأ الفحص' : 'Started!')
            queryClient.invalidateQueries(['scheduleBookings'])
        },
        onError: (e) => toast.error(e.response?.data?.error_ar || e.response?.data?.error || 'Failed')
    })

    const completeMutation = useMutation({
        mutationFn: async (id) => await api.post(`clinic/bookings/${id}/complete/`),
        onSuccess: () => {
            toast.success(isRtl ? 'اكتمل' : 'Completed!')
            queryClient.invalidateQueries(['scheduleBookings'])
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Failed')
    })

    const cancelMutation = useMutation({
        mutationFn: async (id) => await api.post(`clinic/bookings/${id}/cancel/`, { auto_message: true }),
        onSuccess: () => {
            toast.success(isRtl ? 'تم الإلغاء' : 'Cancelled!')
            queryClient.invalidateQueries(['scheduleBookings'])
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Failed')
    })

    const walkinMutation = useMutation({
        mutationFn: async (data) => await api.post('clinic/bookings/add_walkin/', data),
        onSuccess: () => {
            toast.success(isRtl ? 'تمت إضافة المريض' : 'Patient added!')
            queryClient.invalidateQueries(['scheduleBookings'])
            setWalkinModal(false)
            setWalkinData({ patient_name: '', patient_phone: '', notes: '', selected_time: null })
        },
        onError: (e) => toast.error(e.response?.data?.error_ar || e.response?.data?.error || 'Failed')
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
            queryClient.invalidateQueries(['scheduleBookings'])
            setEditWalkinModalOpen(false)
        },
        onError: (e) => toast.error(e.response?.data?.error_ar || e.response?.data?.error || 'Failed')
    })

    const emergencyMutation = useMutation({
        mutationFn: async (data) => await api.post('scheduling/time-off/', { ...data, action: 'AUTO_PROCESS' }),
        onSuccess: (data) => {
            const count = data.data.results.cancelled_count
            toast.success(isRtl ? `تم تسجيل الإجازة وإلغاء ${count} موعد` : `Time off logged, ${count} bookings cancelled`)
            setEmergencyModal(false)
            queryClient.invalidateQueries(['scheduleBookings'])
            queryClient.invalidateQueries(['activeLeaves'])
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Failed')
    })

    const toggleDigitalBlockMutation = useMutation({
        mutationFn: async ({ date, isBlocked, blockId }) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            if (isBlocked && blockId) {
                await api.delete(`scheduling/time-off/${blockId}/`);
            } else {
                await api.post('scheduling/time-off/', {
                    start_date: dateStr,
                    end_date: dateStr,
                    type: 'DIGITAL_UNAVAILABLE',
                    reason: 'Digital Booking Stopped'
                });
            }
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['activeLeaves'] }),
    })

    const navigate = (direction) => {
        if (viewMode === 'WEEKLY') {
            setCurrentDate(direction === 'next' ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
        } else {
            setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
        }
    }

    const canStartExam = (booking) => {
        const bookingDate = new Date(booking.booking_datetime).setHours(0, 0, 0, 0)
        const today = new Date().setHours(0, 0, 0, 0)
        return today >= bookingDate && booking.status === 'CONFIRMED'
    }

    const canAddPatient = () => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const selected = new Date(selectedDate)
        selected.setHours(0, 0, 0, 0)
        if (selected < today) return false
        if (selectedDateCapacity === 0) return false
        const count = selectedDateBookings.filter(b => b.status !== 'CANCELLED').length
        return allowOverbooking || count < selectedDateCapacity
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'PENDING': return 'bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
            case 'CONFIRMED': return 'bg-blue-100/80 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
            case 'IN_PROGRESS': return 'bg-purple-100/80 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700'
            case 'COMPLETED': return 'bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
            case 'CANCELLED': return 'bg-red-100/80 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
            case 'EXPIRED': return 'bg-gray-200/80 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 border-gray-400 dark:border-gray-600'
            default: return 'bg-gray-100 dark:bg-gray-800'
        }
    }

    const getStatusLabel = (status) => {
        const labels = {
            PENDING: isRtl ? 'معلق' : 'Pending',
            CONFIRMED: isRtl ? 'مؤكد' : 'Confirmed',
            IN_PROGRESS: isRtl ? 'جاري' : 'In Progress',
            COMPLETED: isRtl ? 'مكتمل' : 'Done',
            CANCELLED: isRtl ? 'ملغي' : 'Cancelled',
            EXPIRED: isRtl ? 'منتهي' : 'Expired'
        }
        return labels[status] || status
    }

    // No permission - show locked view
    if (!canViewSchedule) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-96 space-y-4">
                    <Lock className="h-16 w-16 text-muted-foreground" />
                    <h2 className="text-xl font-bold">{isRtl ? 'لا يوجد صلاحية' : 'No Permission'}</h2>
                    <p className="text-muted-foreground text-center max-w-md">
                        {isRtl ? 'ليس لديك صلاحية لعرض الجدول. تواصل مع الطبيب لمنحك الصلاحية.' : 'You don\'t have permission to view the schedule. Contact your doctor to grant access.'}
                    </p>
                </div>
            </Layout>
        )
    }

    if (profileLoading) {
        return (
            <Layout>
                <div className="flex justify-center items-center h-96">
                    <div className="text-center space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
                        <p className="text-muted-foreground">{isRtl ? 'جاري التحميل...' : 'Loading...'}</p>
                    </div>
                </div>
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="space-y-6">
                {/* Header - Same style as doctor but with secretary badge */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                                    <Calendar className="h-6 w-6" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold">{isRtl ? 'جدول المواعيد' : 'Schedule'}</h1>
                                    <p className="text-white/80 text-sm flex items-center gap-2">
                                        <Shield className="h-3 w-3" />
                                        {isRtl ? 'عرض السكرتير' : 'Secretary View'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {/* Emergency Off Button - only if has permission */}
                            {canManageTimeOff && (
                                <Button variant="secondary" size="sm" onClick={() => setEmergencyModal(true)} className="bg-red-500/20 hover:bg-red-500/30 text-white border-0">
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                    {isRtl ? 'إجازة طارئة' : 'Emergency Off'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Navigation Card - Same as doctor */}
                <Card className="border-0 shadow-lg bg-gradient-to-r from-slate-50 to-blue-50/50 dark:from-slate-900 dark:to-blue-950/50">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="icon" onClick={() => navigate('prev')} className="h-10 w-10 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900">
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <div className="text-center">
                                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                    {viewMode === 'WEEKLY'
                                        ? `${format(dateRange[0], 'MMM d', { locale })} - ${format(dateRange[dateRange.length - 1], 'MMM d, yyyy', { locale })}`
                                        : format(currentDate, 'MMMM yyyy', { locale })
                                    }
                                </h2>
                                <div className="flex items-center justify-center gap-3 mt-2">
                                    <Badge variant="outline" className="gap-1 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
                                        <Users className="h-3 w-3" />
                                        {isRtl ? `الحد: ${selectedDateCapacity}` : `Limit: ${selectedDateCapacity}`}
                                    </Badge>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => navigate('next')} className="h-10 w-10 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900">
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Calendar Grid - Same as doctor */}
                <div className="overflow-x-auto pb-4">
                    <div className="min-w-[600px] grid gap-2 grid-cols-7">
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => (
                            <div key={day} className="text-center text-sm font-bold text-muted-foreground py-3 bg-gradient-to-b from-muted/50 to-transparent rounded-t-lg">
                                {isRtl ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][i] : day}
                            </div>
                        ))}

                        {dateRange.map(date => {
                            const dayBookings = getBookingsForDate(date)
                            const activeCount = dayBookings.filter(b => b.status !== 'CANCELLED').length
                            const isSelected = isSameDay(date, selectedDate)
                            const isPast = isBefore(date, new Date()) && !isToday(date)
                            const dayCapacity = getCapacityForDate(date)
                            const isWorkingDay = dayCapacity > 0
                            const isFull = isWorkingDay && activeCount >= dayCapacity

                            return (
                                <div
                                    key={date.toISOString()}
                                    onClick={() => setSelectedDate(date)}
                                    className={`
                                    min-h-[90px] p-3 rounded-xl border-2 cursor-pointer transition-all duration-300 relative overflow-hidden
                                    ${isSelected ? 'ring-2 ring-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50 border-purple-200 dark:border-purple-800 shadow-lg scale-105' : 'hover:bg-blue-50/50 dark:hover:bg-blue-950/30 hover:border-blue-200 dark:hover:border-blue-800 border-border'}
                                    ${isToday(date) ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/30' : ''}
                                    ${isPast ? 'opacity-50' : ''}
                                    ${!isWorkingDay ? 'bg-muted/50' : ''}
                                `}
                                >
                                    {isToday(date) && (
                                        <div className="absolute top-1 right-1">
                                            <Sparkles className="h-3 w-3 text-blue-500 animate-pulse" />
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-lg font-bold ${isToday(date) ? 'text-blue-600 dark:text-blue-400' : isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-foreground'}`}>
                                            {format(date, 'd')}
                                        </span>
                                        {!isWorkingDay && (
                                            <Badge className="text-[10px] px-1.5 py-0 bg-gray-400 text-white">
                                                {isRtl ? 'عطلة' : 'Off'}
                                            </Badge>
                                        )}
                                        {isFull && !allowOverbooking && (
                                            <Badge className="text-[10px] px-1.5 py-0 bg-red-500 text-white">
                                                {isRtl ? 'ممتلئ' : 'Full'}
                                            </Badge>
                                        )}
                                    </div>
                                    {activeCount > 0 && (
                                        <div className="space-y-1">
                                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {activeCount}
                                            </div>
                                            <div className="flex gap-1 flex-wrap">
                                                {dayBookings.slice(0, 3).map(b => (
                                                    <div key={b.id} className={`w-2 h-2 rounded-full ${getStatusColor(b.status).split(' ')[0]}`} />
                                                ))}
                                                {dayBookings.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayBookings.length - 3}</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Selected Day Details - Same as doctor with permission controls */}
                <Card className="border-0 shadow-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-3 text-xl">
                                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white">
                                        <Calendar className="h-5 w-5" />
                                    </div>
                                    {format(selectedDate, 'EEEE, d MMMM', { locale })}
                                </CardTitle>
                                <CardDescription className="mt-2 flex items-center gap-2">
                                    <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800">
                                        {selectedDateBookings.filter(b => b.status !== 'CANCELLED').length} / {selectedDateCapacity} {isRtl ? 'مريض' : 'patients'}
                                    </Badge>
                                </CardDescription>
                            </div>
                            {/* Add Patient Button - only if has permission */}
                            {canAddWalkin && (canAddPatient() || allowOverbooking) && (
                                <Button onClick={() => setWalkinModal(true)} className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg">
                                    <UserPlus className="h-4 w-4" />
                                    {isRtl ? 'إضافة مريض' : 'Add Patient'}
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {bookingsLoading ? (
                            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
                        ) : selectedDateBookings.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                                    <Calendar className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                                </div>
                                {/* Digital Toggle - only if has manage_schedule permission */}
                                {canManageSchedule && selectedDate >= new Date().setHours(0, 0, 0, 0) && selectedDateCapacity > 0 && (
                                    <div className="flex items-center justify-center gap-3 mb-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 w-max mx-auto">
                                        <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            {isRtl ? 'الحجز الرقمي:' : 'Digital Booking:'}
                                        </Label>
                                        <div className="flex items-center gap-3" dir="ltr">
                                            <span className={`text-xs font-bold ${leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd')) ? 'text-gray-500' : 'text-green-600'}`}>
                                                {leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd'))
                                                    ? (isRtl ? 'مغلق' : 'Closed')
                                                    : (isRtl ? 'مفتوح' : 'Open')
                                                }
                                            </span>
                                            <div
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer
                                                    ${leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd')) ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-500'}
                                                `}
                                                onClick={() => {
                                                    const block = leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd'))
                                                    toggleDigitalBlockMutation.mutate({ date: selectedDate, isBlocked: !!block, blockId: block?.id })
                                                }}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                                    ${leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd')) ? 'translate-x-1' : 'translate-x-6'}
                                                `} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <p className="text-gray-500 dark:text-gray-400 font-medium">{isRtl ? 'لا توجد مواعيد لهذا اليوم' : 'No appointments for this day'}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Digital Toggle Header - only if has manage_schedule permission */}
                                {canManageSchedule && (
                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{isRtl ? 'حالة الحجز الرقمي:' : 'Digital Booking:'}</span>
                                            {leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd')) ? (
                                                <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-300 gap-1">
                                                    <XCircle className="h-3 w-3" />{isRtl ? 'مغلق' : 'Closed'}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 gap-1">
                                                    <CheckCircle className="h-3 w-3" />{isRtl ? 'متاح' : 'Available'}
                                                </Badge>
                                            )}
                                            <Button
                                                variant={leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd')) ? "default" : "outline"}
                                                size="sm"
                                                className={`h-7 text-xs ml-2 ${leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd')) ? 'bg-green-600 hover:bg-green-700' : 'text-red-600 border-red-200 hover:bg-red-50'}`}
                                                onClick={() => {
                                                    const block = leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd'))
                                                    toggleDigitalBlockMutation.mutate({ date: selectedDate, isBlocked: !!block, blockId: block?.id })
                                                }}
                                                disabled={toggleDigitalBlockMutation.isPending}
                                            >
                                                {toggleDigitalBlockMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                                                    leaves?.find(l => l.type === 'DIGITAL_UNAVAILABLE' && l.status === 'ACTIVE' && l.start_date === format(selectedDate, 'yyyy-MM-dd'))
                                                        ? (isRtl ? 'تفعيل الحجز' : 'Enable')
                                                        : (isRtl ? 'إيقاف الحجز' : 'Stop')
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Booking Cards - Same as doctor but with permission controls */}
                                {selectedDateBookings.map(booking => (
                                    <div key={booking.id} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 hover:shadow-md ${booking.is_overflow ? 'ring-2 ring-amber-400 ring-offset-2' : ''} ${getStatusColor(booking.status)}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-full bg-white/50 dark:bg-black/20 flex items-center justify-center shadow-sm">
                                                <Users className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-gray-200">
                                                    {booking.is_walkin ? booking.walkin_patient_name : booking.patient_name}
                                                    {booking.is_walkin && <Badge variant="outline" className="ml-2 text-xs bg-white/50">{isRtl ? 'حضوري' : 'Walk-in'}</Badge>}
                                                    {booking.is_overflow && <Badge className="ml-2 text-xs bg-amber-100 text-amber-700 border-amber-300">{isRtl ? 'إضافي' : 'Extra'}</Badge>}
                                                </p>
                                                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-1 flex-wrap">
                                                    <Clock className="h-3 w-3" />
                                                    {format(new Date(booking.booking_datetime), 'HH:mm')}
                                                    <Badge className="text-xs">{getStatusLabel(booking.status)}</Badge>
                                                    <Badge className={`text-xs ${booking.booking_type === 'FOLLOWUP' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-teal-100 text-teal-700 border-teal-200'}`}>
                                                        {booking.booking_type === 'FOLLOWUP' ? (isRtl ? 'مراجعة' : 'Follow-up') : (isRtl ? 'زيارة جديدة' : 'New Visit')}
                                                    </Badge>
                                                    {booking.number_of_people > 1 && (
                                                        <Badge className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200">
                                                            {booking.number_of_people} {isRtl ? 'أشخاص' : 'people'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {/* Walk-in phone & notes */}
                                                {booking.is_walkin && (booking.walkin_patient_phone || booking.doctor_notes) && (
                                                    <div className="flex flex-col gap-1.5 mt-1.5">
                                                        {booking.walkin_patient_phone && (
                                                            <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                                                                <Phone className="h-3 w-3" />
                                                                <span dir="ltr">{booking.walkin_patient_phone}</span>
                                                            </div>
                                                        )}
                                                        {booking.doctor_notes && (
                                                            <div className="text-xs px-2.5 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                                                <FileText className="h-3 w-3 inline-block mr-1 mb-0.5" />
                                                                {booking.doctor_notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            {/* Actions controlled by permissions */}
                                            {booking.is_walkin && canManageBookings && (
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
                                            {booking.status === 'PENDING' && canManageBookings && (
                                                <>
                                                    <Button size="sm" onClick={() => confirmMutation.mutate(booking.id)} className="bg-blue-500 hover:bg-blue-600">
                                                        <CheckCircle className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(booking.id)}>
                                                        <XCircle className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </>
                                            )}
                                            {booking.status === 'CONFIRMED' && (
                                                <>
                                                    {canCheckin && (
                                                        <Button size="sm" onClick={() => startMutation.mutate(booking.id)} disabled={!canStartExam(booking)} className="bg-purple-500 hover:bg-purple-600">
                                                            <Play className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {canManageBookings && (
                                                        <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(booking.id)}>
                                                            <XCircle className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                            {booking.status === 'IN_PROGRESS' && canCheckin && (
                                                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={() => completeMutation.mutate(booking.id)}>
                                                    <CheckCircle className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Walk-in Modal - Same as doctor */}
            {walkinModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            {isRtl ? 'إضافة مريض حضوري' : 'Add Walk-in Patient'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{format(selectedDate, 'EEEE, d MMMM yyyy', { locale })}</p>

                        <div className="space-y-3 mb-4">
                            <div>
                                <Label className="text-sm font-semibold">{isRtl ? 'اسم المريض *' : 'Patient Name *'}</Label>
                                <Input value={walkinData.patient_name} onChange={e => setWalkinData({ ...walkinData, patient_name: e.target.value })} className="mt-1 border-2 focus:ring-2 focus:ring-blue-400" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-sm font-semibold">{isRtl ? 'رقم الهاتف' : 'Phone'}</Label>
                                    <Input value={walkinData.patient_phone} onChange={e => setWalkinData({ ...walkinData, patient_phone: e.target.value })} className="mt-1 border-2" />
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">{isRtl ? 'ملاحظات' : 'Notes'}</Label>
                                    <Input value={walkinData.notes} onChange={e => { if (e.target.value.length <= 50) setWalkinData({ ...walkinData, notes: e.target.value }) }} maxLength={50} className="mt-1 border-2" />
                                    <span className={`text-[11px] mt-0.5 block ${walkinData.notes.length >= 45 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {walkinData.notes.length}/50
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mb-4">
                            <Label className="text-sm font-semibold mb-2 block">{isRtl ? 'اختر الوقت' : 'Select Time'}</Label>
                            {slotsLoading ? (
                                <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                            ) : daySlots?.slots?.length === 0 ? (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">{isRtl ? 'لا توجد أوقات متاحة' : 'No slots available'}</div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                    {daySlots?.slots?.map((slot, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setWalkinData({ ...walkinData, selected_time: slot.datetime })}
                                            disabled={slot.is_expired || (slot.is_full && !slot.is_overflow)}
                                            className={`p-2 rounded-lg text-sm font-medium transition-all duration-200 border-2
                                                ${walkinData.selected_time === slot.datetime
                                                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white border-transparent shadow-lg scale-105'
                                                    : slot.is_expired
                                                        ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 cursor-not-allowed opacity-60'
                                                        : slot.is_overflow
                                                            ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                                                            : slot.is_full
                                                                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-400 cursor-not-allowed opacity-50'
                                                                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:text-gray-200'}
                                            `}
                                        >
                                            {slot.is_overflow ? (
                                                <div className="font-bold text-center">{isRtl ? 'إضافي' : 'Extra'}</div>
                                            ) : slot.is_expired ? (
                                                <>
                                                    <div className="font-bold">{slot.time}</div>
                                                    <div className="text-[10px]">{isRtl ? 'منتهي' : 'Expired'}</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="font-bold">{slot.time}</div>
                                                    <div className="text-[10px] opacity-70">{`${slot.booked}/${slot.max}`}</div>
                                                </>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {walkinData.selected_time && (
                            <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    {isRtl ? 'الوقت المحدد:' : 'Selected Time:'}
                                    <span className="text-blue-600 dark:text-blue-400 mx-2">{format(new Date(walkinData.selected_time), 'HH:mm')}</span>
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button
                                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                                onClick={() => walkinMutation.mutate({
                                    ...walkinData,
                                    booking_date: format(selectedDate, 'yyyy-MM-dd'),
                                    booking_datetime: walkinData.selected_time
                                })}
                                disabled={walkinMutation.isPending || !walkinData.patient_name || !walkinData.selected_time}
                            >
                                {walkinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRtl ? 'إضافة' : 'Add Patient')}
                            </Button>
                            <Button variant="outline" onClick={() => { setWalkinModal(false); setWalkinData({ patient_name: '', patient_phone: '', notes: '', selected_time: null }); }}>
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

            {/* Emergency Time Off Modal - Same as doctor, only if has permission */}
            {emergencyModal && canManageTimeOff && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-lg w-full mx-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-4 mb-6 border-b pb-4">
                            <div className="h-12 w-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-6 w-6 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{isRtl ? 'تسجيل إجازة طارئة' : 'Emergency Time Off'}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{isRtl ? 'إدارة الغياب المفاجئ وإعادة الجدولة' : 'Manage unexpected absence & rescheduling'}</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider ml-1">{isRtl ? 'من' : 'From'}</Label>
                                    <Input type="date" className="pl-3 pr-3 h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:bg-white dark:focus:bg-gray-700 transition-colors dark:text-white"
                                        min={format(new Date(), 'yyyy-MM-dd')}
                                        value={format(emergencyData.start_date, 'yyyy-MM-dd')}
                                        onChange={e => setEmergencyData({ ...emergencyData, start_date: new Date(e.target.value) })} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 tracking-wider ml-1">{isRtl ? 'إلى' : 'To'}</Label>
                                    <Input type="date" className="pl-3 pr-3 h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:bg-white dark:focus:bg-gray-700 transition-colors dark:text-white"
                                        min={format(new Date(), 'yyyy-MM-dd')}
                                        value={format(emergencyData.end_date, 'yyyy-MM-dd')}
                                        onChange={e => setEmergencyData({ ...emergencyData, end_date: new Date(e.target.value) })} />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isRtl ? 'سبب الغياب' : 'Reason for Absence'}</Label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {[
                                        { id: 'sick', label_ar: 'ظرف صحي', label_en: 'Health Issue' },
                                        { id: 'family', label_ar: 'ظرف عائلي', label_en: 'Family Emergency' },
                                        { id: 'personal', label_ar: 'أمر شخصي', label_en: 'Personal Matter' },
                                        { id: 'travel', label_ar: 'سفر مفاجئ', label_en: 'Unexpected Travel' }
                                    ].map(reason => (
                                        <button key={reason.id}
                                            onClick={() => setEmergencyData({ ...emergencyData, reason: isRtl ? reason.label_ar : reason.label_en })}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${emergencyData.reason === (isRtl ? reason.label_ar : reason.label_en) ? 'bg-gray-900 text-white border-gray-900 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:bg-gray-700'}`}
                                        >
                                            {isRtl ? reason.label_ar : reason.label_en}
                                        </button>
                                    ))}
                                </div>
                                <Input className="h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:bg-white dark:focus:bg-gray-700 transition-colors dark:text-white"
                                    placeholder={isRtl ? 'سبب آخر...' : 'Other reason...'}
                                    value={emergencyData.reason}
                                    onChange={e => setEmergencyData({ ...emergencyData, reason: e.target.value })} />
                            </div>

                            {/* Expiry Fraction Selector */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100">{isRtl ? 'مهلة الرد على البدائل' : 'Response Deadline'}</Label>
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/40 px-2 py-1 rounded-full">
                                        {isRtl ? 'حسب الموعد' : 'Dynamic'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { id: 'QUARTER', label: isRtl ? 'ربع المدة' : 'Quarter', sub: isRtl ? 'أسرع' : 'Faster', desc: '1/4' },
                                        { id: 'HALF', label: isRtl ? 'نصف المدة' : 'Half', sub: isRtl ? 'أكثر مرونة' : 'Flexible', desc: '1/2' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setEmergencyData({ ...emergencyData, expiry_fraction: opt.id })}
                                            className={`
                                            relative p-4 rounded-xl border-2 text-center transition-all duration-200
                                            ${emergencyData.expiry_fraction === opt.id
                                                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-sm'
                                                    : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                }
                                        `}
                                        >
                                            <div className="text-2xl font-bold mb-1">{opt.desc}</div>
                                            <div className="font-semibold text-sm">{opt.label}</div>
                                            <div className="text-[10px] uppercase tracking-wide opacity-70 font-semibold mt-1">{opt.sub}</div>
                                            {emergencyData.expiry_fraction === opt.id && (
                                                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500"></div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {isRtl
                                        ? 'المهلة تُحسب كنسبة من الوقت بين الآن وأقرب موعد بديل'
                                        : 'Deadline is calculated as a fraction of time between now and the earliest alternative slot'
                                    }
                                </p>
                            </div>

                            <div className="flex gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 items-start">
                                <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300 font-medium">
                                    {isRtl ? 'سيتم إلغاء جميع المواعيد في هذه الفترة الحالية.' : 'All current bookings in this range will be cancelled.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8 pt-4 border-t">
                            <Button className="flex-1 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 h-12 text-base shadow-lg rounded-xl"
                                onClick={() => emergencyMutation.mutate({
                                    ...emergencyData,
                                    start_date: format(emergencyData.start_date, 'yyyy-MM-dd'),
                                    end_date: format(emergencyData.end_date, 'yyyy-MM-dd')
                                })}
                                disabled={emergencyMutation.isPending || !emergencyData.reason}
                            >
                                {emergencyMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : (isRtl ? 'تأكيد الإجراء' : 'Confirm Action')}
                            </Button>
                            <Button variant="ghost" className="h-12 px-6 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400" onClick={() => setEmergencyModal(false)}>
                                {isRtl ? 'إلغاء' : 'Cancel'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    )
}

export default SecretarySchedulePage
