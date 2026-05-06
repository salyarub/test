import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { toast } from 'sonner'
import {
    Calendar,
    Users,
    Star,
    Clock,
    CheckCircle,
    AlertCircle,
    XCircle,
    TrendingUp,
    Bell,
    Loader2,
    Settings,
    Play,
    MessageSquare,
    Activity,
    Target
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts'

const StatCard = ({ title, value, icon: Icon, color = "text-primary" }) => (
    <Card>
        <CardContent className="pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="text-3xl font-bold mt-1">{value}</p>
                </div>
                <div className={`h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center ${color}`}>
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

const DoctorDashboardNew = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const queryClient = useQueryClient()
    const [cancelModalOpen, setCancelModalOpen] = useState(false)
    const [selectedBookingId, setSelectedBookingId] = useState(null)

    // Fetch doctor's bookings - Real-time polling
    const { data: bookings, isLoading: bookingsLoading } = useQuery({
        queryKey: ['doctorBookings'],
        queryFn: async () => {
            const res = await api.get('clinic/bookings/')
            return res.data
        },
        refetchInterval: 5000,
    })

    // Fetch notifications count - Real-time polling
    const { data: notifications } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const res = await api.get('notifications/')
            return res.data
        },
        refetchInterval: 5000,
    })

    // Fetch user profile
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            const res = await api.get('auth/me/')
            return res.data
        }
    })

    // Confirm booking
    const confirmMutation = useMutation({
        mutationFn: async (bookingId) => {
            return await api.post(`clinic/bookings/${bookingId}/confirm/`)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم تأكيد الموعد' : 'Booking confirmed!')
            queryClient.invalidateQueries(['doctorBookings'])
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    // Start examination
    const startMutation = useMutation({
        mutationFn: async (bookingId) => {
            return await api.post(`clinic/bookings/${bookingId}/start_examination/`)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'بدأ الفحص' : 'Examination started')
            queryClient.invalidateQueries(['doctorBookings'])
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    // Complete booking
    const completeMutation = useMutation({
        mutationFn: async (bookingId) => {
            return await api.post(`clinic/bookings/${bookingId}/complete/`)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم إكمال الموعد' : 'Appointment completed!')
            queryClient.invalidateQueries(['doctorBookings'])
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    // Cancel booking with message
    const cancelMutation = useMutation({
        mutationFn: async ({ bookingId, message }) => {
            return await api.post(`clinic/bookings/${bookingId}/cancel/`, {
                message: message,
                auto_message: !message
            })
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم إلغاء الموعد' : 'Booking cancelled')
            queryClient.invalidateQueries(['doctorBookings'])
            setCancelModalOpen(false)
        },
        onError: (error) => toast.error(error.response?.data?.error || 'Failed')
    })

    const handleCancelClick = (bookingId) => {
        setSelectedBookingId(bookingId)
        setCancelModalOpen(true)
    }

    const handleCancelConfirm = (message) => {
        cancelMutation.mutate({ bookingId: selectedBookingId, message })
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const todayBookings = useMemo(() => {
        if (!bookings) return []
        return bookings
            .filter(b => b.booking_datetime?.startsWith(todayStr))
            .sort((a, b) => {
                const aCancelled = a.status === 'CANCELLED'
                const bCancelled = b.status === 'CANCELLED'
                
                if (aCancelled && !bCancelled) return 1
                if (!aCancelled && bCancelled) return -1
                
                return new Date(a.booking_datetime) - new Date(b.booking_datetime)
            })
    }, [bookings, todayStr])

    const pendingBookings = todayBookings.filter(b => b.status === 'PENDING')
    const confirmedBookings = todayBookings.filter(b => b.status === 'CONFIRMED')
    const inProgressBookings = todayBookings.filter(b => b.status === 'IN_PROGRESS')
    const completedBookings = todayBookings.filter(b => b.status === 'COMPLETED')
    const unreadNotifications = notifications?.filter(n => !n.is_read).length || 0

    // Performance Calculations
    const nowTime = new Date().getTime()
    const missedBookingsCount = todayBookings.filter(b => {
        if (b.status === 'CANCELLED') return true
        if (['PENDING', 'CONFIRMED'].includes(b.status)) {
            // Check if the booking time has already passed
            const bookingDateTime = new Date(b.booking_datetime).getTime()
            // Add a 1 hour buffer to consider it "missed" if they didn't show up 1 hr after their slot started
            const bufferTime = 60 * 60 * 1000
            return (bookingDateTime + bufferTime) < nowTime
        }
        return false
    }).length

    const totalTodayCount = todayBookings.length
    const completedCount = completedBookings.length
    const completionRate = totalTodayCount > 0 ? Math.round((completedCount / totalTodayCount) * 100) : 0

    const ongoingCount = totalTodayCount - completedCount - missedBookingsCount
    const chartData = [
        { name: isRtl ? 'مكتمل' : 'Completed', value: completedCount, color: '#10b981' }, // Emerald
        { name: isRtl ? 'جاري / قيد الانتظار' : 'Ongoing/Pending', value: Math.max(0, ongoingCount), color: '#fbbf24' }, // Amber
        { name: isRtl ? 'لم يحضر / ملغي' : 'Missed/Cancelled', value: missedBookingsCount, color: '#f87171' } // Red
    ].filter(item => item.value > 0) // Only show categories with data


    const getStatusBadge = (status) => {
        const styles = {
            PENDING: { bg: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, label: isRtl ? 'معلق' : 'Pending' },
            CONFIRMED: { bg: 'bg-blue-100 text-blue-800', icon: CheckCircle, label: isRtl ? 'مؤكد' : 'Confirmed' },
            IN_PROGRESS: { bg: 'bg-purple-100 text-purple-800', icon: Play, label: isRtl ? 'جاري الفحص' : 'In Progress' },
            COMPLETED: { bg: 'bg-green-100 text-green-800', icon: CheckCircle, label: isRtl ? 'مكتمل' : 'Completed' },
            CANCELLED: { bg: 'bg-red-100 text-red-800', icon: XCircle, label: isRtl ? 'ملغي' : 'Cancelled' },
        }
        const config = styles[status] || styles.PENDING
        const Icon = config.icon
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg}`}>
                <Icon className="h-3 w-3" />
                {config.label}
            </span>
        )
    }

    const getBookingTypeBadge = (type) => {
        if (type === 'FOLLOWUP') {
            return <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">{isRtl ? 'مراجعة' : 'Follow-up'}</span>
        }
        return <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">{isRtl ? 'جديد' : 'New'}</span>
    }

    // Actions based on status
    const renderActions = (booking) => {
        switch (booking.status) {
            case 'PENDING':
                return (
                    <>
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
                        <Button size="sm" className="gap-1 bg-purple-600 hover:bg-purple-700" onClick={() => startMutation.mutate(booking.id)} disabled={startMutation.isPending}>
                            <Play className="h-3 w-3" />{isRtl ? 'بدء الفحص' : 'Start'}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => handleCancelClick(booking.id)}>
                            <XCircle className="h-3 w-3" />{isRtl ? 'إلغاء' : 'Cancel'}
                        </Button>
                    </>
                )
            case 'IN_PROGRESS':
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
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">
                            {isRtl ? 'مرحباً، د.' : 'Welcome, Dr.'} {user?.first_name || 'Doctor'}
                        </h1>
                        <p className="text-muted-foreground">{isRtl ? 'لوحة تحكم الطبيب' : 'Doctor Dashboard'}</p>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/doctor/availability">
                            <Button variant="outline" className="gap-2">
                                <Settings className="h-4 w-4" />{isRtl ? 'الدوام' : 'Schedule'}
                            </Button>
                        </Link>
                        {unreadNotifications > 0 && (
                            <Link to="/notifications">
                                <Button variant="outline" className="gap-2 relative">
                                    <Bell className="h-4 w-4" />
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                                        {unreadNotifications}
                                    </span>
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title={isRtl ? "معلق اليوم" : "Pending Today"} value={pendingBookings.length} icon={Clock} color="text-yellow-600" />
                    <StatCard title={isRtl ? "مؤكد اليوم" : "Confirmed Today"} value={confirmedBookings.length} icon={CheckCircle} color="text-blue-600" />
                    <StatCard title={isRtl ? "جاري الفحص" : "In Progress"} value={inProgressBookings.length} icon={Play} color="text-purple-600" />
                    <StatCard title={isRtl ? "مكتمل اليوم" : "Completed Today"} value={completedBookings.length} icon={Users} color="text-green-600" />
                </div>

                {/* Today's Performance Overview */}
                <Card className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 text-white overflow-hidden relative shadow-xl">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl"></div>
                    <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 rounded-full bg-white/10 blur-2xl"></div>
                    <CardContent className="p-6 md:p-8 relative z-10">
                        <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
                            <div className="space-y-4 text-center md:text-start flex-1">
                                <div className="inline-flex items-center justify-center gap-2 bg-white/20 px-3 py-1 rounded-full text-indigo-50">
                                    <Activity className="h-4 w-4" />
                                    <span className="text-sm font-medium">{isRtl ? 'ملخص الأداء اليومي' : 'Daily Performance Summary'}</span>
                                </div>
                                <div>
                                    <h3 className="text-4xl font-extrabold">{completionRate}%</h3>
                                    <p className="text-indigo-200 text-sm mt-1">{isRtl ? 'نسبة إنجاز المواعيد اليوم' : 'Today\'s appointment completion rate'}</p>
                                </div>

                                <div className="pt-4 grid grid-cols-2 gap-4">
                                    <div className="text-start p-3 rounded-xl bg-white/10 border border-white/5">
                                        <p className="text-indigo-200 text-xs font-medium tracking-wider">{isRtl ? 'إجمالي المرضى' : 'Total Patients'}</p>
                                        <span className="text-2xl font-bold mt-1 block">{totalTodayCount}</span>
                                    </div>
                                    <div className="text-start p-3 rounded-xl bg-white/10 border border-white/5">
                                        <p className="text-indigo-200 text-xs font-medium tracking-wider">{isRtl ? 'اكتمل' : 'Completed'}</p>
                                        <span className="text-2xl font-bold mt-1 block text-emerald-400">{completedCount}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 w-full flex flex-col items-center justify-center min-h-[250px]">
                                {totalTodayCount > 0 ? (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={90}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: 'rgba(30, 27, 75, 0.9)', color: '#fff' }}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                height={36}
                                                iconType="circle"
                                                wrapperStyle={{ paddingTop: '10px' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-indigo-300/60 p-8 border-2 border-dashed border-indigo-300/20 rounded-full w-48 h-48">
                                        <Target className="h-10 w-10 mb-2 opacity-50" />
                                        <p className="text-sm font-medium">{isRtl ? 'لاتوجد بيانات اليوم' : 'No data today'}</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </CardContent>
                </Card>

                {/* Pending */}
                {pendingBookings.length > 0 && (
                    <Card className="border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
                                <Clock className="h-5 w-5" />{isRtl ? 'بانتظار الموافقة' : 'Awaiting Approval'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {pendingBookings.map(booking => (
                                <div key={booking.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-card rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-800">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{booking.patient_name || 'Patient'}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{format(new Date(booking.booking_datetime), 'PPP p')}</span>
                                                {getBookingTypeBadge(booking.booking_type)}
                                                {booking.number_of_people > 1 && (
                                                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                                                        {isRtl ? `${booking.number_of_people} أشخاص` : `${booking.number_of_people} people`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">{renderActions(booking)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Confirmed */}
                {confirmedBookings.length > 0 && (
                    <Card className="border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-400">
                                <CheckCircle className="h-5 w-5" />{isRtl ? 'المؤكدة' : 'Confirmed'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {confirmedBookings.map(booking => (
                                <div key={booking.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-card rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-800">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{booking.patient_name || 'Patient'}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{format(new Date(booking.booking_datetime), 'PPP p')}</span>
                                                {getBookingTypeBadge(booking.booking_type)}
                                                {booking.number_of_people > 1 && (
                                                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                                                        {isRtl ? `${booking.number_of_people} أشخاص` : `${booking.number_of_people} people`}
                                                    </span>
                                                )}
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
                {inProgressBookings.length > 0 && (
                    <Card className="border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-400">
                                <Play className="h-5 w-5" />{isRtl ? 'جاري الفحص' : 'In Progress'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {inProgressBookings.map(booking => (
                                <div key={booking.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-card rounded-lg shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-800">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{booking.patient_name || 'Patient'}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">{format(new Date(booking.booking_datetime), 'p')}</span>
                                                {booking.number_of_people > 1 && (
                                                    <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                                                        {isRtl ? `${booking.number_of_people} أشخاص` : `${booking.number_of_people} people`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">{renderActions(booking)}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {bookingsLoading && (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
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
        </Layout>
    )
}

export default DoctorDashboardNew
