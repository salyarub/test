import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import confetti from 'canvas-confetti'
import Layout from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { Stethoscope, Clock, CheckCircle, ArrowLeft, UserPlus, RefreshCw, Loader2, MapPin, Building, Facebook, Instagram, Twitter, Youtube, Video, Users, Trash2, AlertTriangle, DollarSign, Sparkles, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import MapPicker from '@/components/ui/MapPicker'

const DoctorBookingPage = () => {
    const { doctorId } = useParams()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { t, i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const [selectedSlot, setSelectedSlot] = useState(null)
    const [bookingType, setBookingType] = useState('NEW')

    const [bookingSuccess, setBookingSuccess] = useState(false)
    const [showCancelDialog, setShowCancelDialog] = useState(false)
    const [expandedDays, setExpandedDays] = useState({})

    const toggleDay = (dateKey) => {
        setExpandedDays(prev => ({
            ...prev,
            [dateKey]: !prev[dateKey]
        }))
    }

    // Fetch doctor details
    const { data: doctor, isLoading: doctorLoading } = useQuery({
        queryKey: ['doctor', doctorId],
        queryFn: async () => {
            const res = await api.get(`doctors/${doctorId}/`)
            return res.data
        }
    })

    // Fetch available slots from API - Real-time data, no cache
    const { data: slotsData, isLoading: slotsLoading } = useQuery({
        queryKey: ['doctorSlots', doctorId],
        queryFn: async () => {
            const res = await api.get(`doctors/${doctorId}/slots/`)
            return res.data
        },
        staleTime: 0,
        refetchOnWindowFocus: true
    })

    // Check if patient already has an active booking with this doctor
    const { data: myBookings } = useQuery({
        queryKey: ['myBookingsWithDoctor', doctorId],
        queryFn: async () => {
            const res = await api.get('clinic/bookings/')
            return res.data
        }
    })

    const activeStatuses = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING_PENDING']
    const existingActiveBooking = myBookings?.find(b => {
        if (b.doctor !== doctorId || !activeStatuses.includes(b.status)) return false

        // Booking is no longer active once the booking day has ended
        const bookingDate = new Date(b.booking_datetime)
        bookingDate.setHours(23, 59, 59, 999)
        return bookingDate.getTime() >= new Date().getTime()
    })
    const hasActiveBooking = !!existingActiveBooking

    // Group slots by date
    const slotsByDate = (slotsData?.slots || []).reduce((acc, slot) => {
        const dateKey = format(parseISO(slot.datetime), 'yyyy-MM-dd')
        if (!acc[dateKey]) acc[dateKey] = []
        acc[dateKey].push(slot)
        return acc
    }, {})

    // Add blocked dates to the list
    const blockedDates = slotsData?.blocked_dates || []
    blockedDates.forEach(dateStr => {
        if (!slotsByDate[dateStr]) {
            slotsByDate[dateStr] = 'BLOCKED'
        }
    })

    // Sort dates
    const sortedDateKeys = Object.keys(slotsByDate).sort()

    // Book appointment mutation
    const bookMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post('clinic/bookings/', {
                doctor: doctorId,
                booking_datetime: selectedSlot.datetime,
                booking_type: bookingType,
                patient_notes: ''
            })
            return res.data
        },
        onSuccess: () => {
            setBookingSuccess(true)
            queryClient.invalidateQueries({ queryKey: ['myBookings'] })
            queryClient.invalidateQueries({ queryKey: ['myBookingsWithDoctor', doctorId] })
            queryClient.invalidateQueries({ queryKey: ['doctorSlots', doctorId] })
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            })
        },
        onError: (error) => {
            console.error("Booking Error:", error.response?.data || error)
            const errorMsg = error.response?.data?.detail ||
                error.response?.data?.error ||
                JSON.stringify(error.response?.data) ||
                (isRtl ? 'فشل الحجز' : 'Booking failed')
            toast.error(errorMsg)
        }
    })

    // Cancel existing booking mutation
    const cancelMutation = useMutation({
        mutationFn: async (bookingId) => {
            return api.post(`clinic/bookings/${bookingId}/patient_cancel/`)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم إلغاء الحجز بنجاح! يمكنك الآن حجز موعد جديد' : 'Booking cancelled! You can now book a new appointment')
            queryClient.invalidateQueries(['myBookingsWithDoctor', doctorId])
            queryClient.invalidateQueries(['myBookings'])
            setShowCancelDialog(false)
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || (isRtl ? 'فشل إلغاء الحجز' : 'Failed to cancel booking'))
        }
    })

    const SocialIcon = ({ url, icon: Icon, color, bg }) => {
        if (!url) return null
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center hover:scale-110 transition-all duration-200 ${color}`}>
                <Icon className="h-5 w-5" />
            </a>
        )
    }

    // ── Success Screen ──
    if (bookingSuccess) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto">
                    <div className="h-28 w-28 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6 shadow-xl shadow-green-500/20">
                        <CheckCircle className="h-14 w-14 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">
                        {isRtl ? 'تم الحجز بنجاح! 🎉' : 'Booking Confirmed! 🎉'}
                    </h1>
                    <div className="bg-muted/50 rounded-2xl p-5 w-full mt-4 mb-2 space-y-2">
                        <p className="text-muted-foreground">
                            {isRtl
                                ? `موعدك يوم ${format(parseISO(selectedSlot.datetime), 'PPP', { locale: ar })} الساعة ${format(parseISO(selectedSlot.datetime), 'p')}`
                                : `Your appointment is on ${format(parseISO(selectedSlot.datetime), 'PPP')} at ${format(parseISO(selectedSlot.datetime), 'p')}`
                            }
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${bookingType === 'NEW' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                {bookingType === 'NEW'
                                    ? (isRtl ? '📋 حجز جديد' : '📋 New Patient')
                                    : (isRtl ? '🔄 مراجعة' : '🔄 Follow-up')
                                }
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-6 w-full">
                        <Button onClick={() => navigate('/my-bookings')} className="flex-1 gap-2 rounded-xl h-12 bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 text-white">
                            {isRtl ? 'عرض حجوزاتي' : 'View My Bookings'}
                        </Button>
                        <Button variant="outline" onClick={() => navigate('/patient')} className="flex-1 gap-2 rounded-xl h-12">
                            <ArrowLeft className="h-4 w-4" />
                            {isRtl ? 'العودة للبحث' : 'Back to Search'}
                        </Button>
                    </div>
                </div>
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-6">
                <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 rounded-xl hover:bg-muted/80">
                    <ArrowLeft className="h-4 w-4" />
                    {isRtl ? 'رجوع' : 'Back'}
                </Button>

                {/* ── Warning: Active Booking Exists ── */}
                {hasActiveBooking && (() => {
                    // Cancellation Policy Check
                    const bookingTime = new Date(existingActiveBooking.booking_datetime)
                    const createdAt = new Date(existingActiveBooking.created_at)
                    const now = new Date()
                    const msUntilBooking = bookingTime - now
                    const msSinceCreation = now - createdAt
                    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
                    const TEN_MINUTES = 10 * 60 * 1000

                    const isWithin24h = msUntilBooking <= TWENTY_FOUR_HOURS
                    const graceExpired = msSinceCreation > TEN_MINUTES
                    const isLocked = isWithin24h && graceExpired
                    const inGracePeriod = isWithin24h && !graceExpired
                    const graceRemainingMs = inGracePeriod ? TEN_MINUTES - msSinceCreation : 0
                    const graceMinutes = Math.ceil(graceRemainingMs / 60000)

                    return (
                        <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-6 shadow-lg">
                            <div className="flex flex-col md:flex-row items-start gap-4">
                                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shrink-0">
                                    <AlertTriangle className="h-7 w-7 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-amber-800 dark:text-amber-400">
                                        {isRtl ? 'لديك حجز نشط بالفعل' : 'You Have an Active Booking'}
                                    </h3>
                                    <div className="mt-3 p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-amber-200 dark:border-amber-700">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                                                <Clock className="h-6 w-6 text-amber-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">
                                                    {format(parseISO(existingActiveBooking.booking_datetime), 'EEEE', { locale: isRtl ? ar : enUS })}
                                                </p>
                                                <p className="text-amber-700 dark:text-amber-300 font-medium">
                                                    {format(parseISO(existingActiveBooking.booking_datetime), 'PPP', { locale: isRtl ? ar : enUS })}
                                                </p>
                                                <p className="text-lg font-bold text-primary">
                                                    {format(parseISO(existingActiveBooking.booking_datetime), 'HH:mm')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
                                        {isRtl
                                            ? 'لا يمكنك الحجز مجدداً إلا بعد إتمام أو إلغاء الحجز الحالي'
                                            : 'You can only book again after your current appointment is completed or cancelled'
                                        }
                                    </p>
                                    <div className="flex flex-wrap gap-3 mt-4">
                                        <Button className="bg-amber-600 hover:bg-amber-700 shadow-md rounded-xl gap-2" onClick={() => navigate('/my-bookings')}>
                                            <Clock className="h-4 w-4" />
                                            {isRtl ? 'عرض حجوزاتي' : 'View My Bookings'}
                                        </Button>
                                        {isLocked ? (
                                            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
                                                <AlertTriangle className="h-4 w-4 text-red-500" />
                                                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                                    {isRtl ? 'لا يمكن الإلغاء قبل الموعد بأقل من 24 ساعة' : 'Cannot cancel within 24 hours of appointment'}
                                                </span>
                                            </div>
                                        ) : (
                                            <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl gap-2" onClick={() => setShowCancelDialog(true)}>
                                                <Trash2 className="h-4 w-4" />
                                                {isRtl ? 'إلغاء الحجز الحالي' : 'Cancel Current Booking'}
                                                {inGracePeriod && (
                                                    <span className="text-xs bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full">
                                                        {isRtl ? `${graceMinutes} د متبقية` : `${graceMinutes}m left`}
                                                    </span>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })()}

                {/* Cancel Confirmation Dialog */}
                <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-red-600 flex items-center gap-2">
                                <Trash2 className="h-5 w-5" />
                                {isRtl ? 'تأكيد إلغاء الحجز' : 'Confirm Cancellation'}
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                {isRtl
                                    ? 'هل أنت متأكد من إلغاء هذا الحجز؟ سيتم إخطار الطبيب بالإلغاء.'
                                    : 'Are you sure you want to cancel this booking? The doctor will be notified.'
                                }
                            </DialogDescription>
                        </DialogHeader>
                        {existingActiveBooking && (
                            <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg border border-red-200 dark:border-red-800">
                                <p className="font-semibold text-red-800 dark:text-red-400">
                                    {format(parseISO(existingActiveBooking.booking_datetime), 'EEEE, PPP', { locale: isRtl ? ar : enUS })}
                                </p>
                                <p className="text-red-600 dark:text-red-300 text-lg font-bold">
                                    {format(parseISO(existingActiveBooking.booking_datetime), 'HH:mm')}
                                </p>
                            </div>
                        )}
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                                {isRtl ? 'تراجع' : 'Go Back'}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => cancelMutation.mutate(existingActiveBooking.id)}
                                disabled={cancelMutation.isPending}
                            >
                                {cancelMutation.isPending
                                    ? (isRtl ? 'جاري الإلغاء...' : 'Cancelling...')
                                    : (isRtl ? 'نعم، إلغاء الحجز' : 'Yes, Cancel')
                                }
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ── Doctor Hero Card ── */}
                <div className="rounded-2xl border bg-card overflow-hidden">
                    {/* Gradient Banner */}
                    <div className="h-32 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 relative">
                        <Stethoscope className="absolute top-4 right-6 h-20 w-20 text-white/10" />
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent"></div>
                    </div>

                    <div className="relative -mt-12 px-6 pb-6">
                        <div className="flex flex-col md:flex-row items-center md:items-end gap-5">
                            {/* Doctor Avatar */}
                            <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-3xl font-bold shadow-xl ring-4 ring-card overflow-hidden shrink-0">
                                {doctor?.profile_picture ? (
                                    <img src={doctor.profile_picture} alt="Dr." className="h-full w-full object-cover" />
                                ) : (
                                    <Stethoscope className="h-10 w-10" />
                                )}
                            </div>

                            {/* Name & Specialty */}
                            <div className="flex-1 text-center md:text-start pb-1">
                                <h1 className="text-2xl font-bold">
                                    Dr. {doctor?.first_name || 'Doctor'} {doctor?.last_name || ''}
                                </h1>
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-1.5">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                                        <Stethoscope className="h-3 w-3" />
                                        {doctor?.specialty || 'General Practitioner'}
                                    </span>
                                </div>
                                {/* Social Media Icons */}
                                <div className="flex gap-2 mt-3 justify-center md:justify-start">
                                    <SocialIcon url={doctor?.facebook} icon={Facebook} color="text-blue-600" bg="bg-blue-500/10" />
                                    <SocialIcon url={doctor?.instagram} icon={Instagram} color="text-pink-500" bg="bg-pink-500/10" />
                                    <SocialIcon url={doctor?.twitter} icon={Twitter} color="text-sky-500" bg="bg-sky-500/10" />
                                    <SocialIcon url={doctor?.youtube} icon={Youtube} color="text-red-600" bg="bg-red-500/10" />
                                    <SocialIcon url={doctor?.tiktok} icon={Video} color="text-gray-700 dark:text-gray-300" bg="bg-gray-500/10" />
                                </div>
                            </div>

                            {/* Price Badge */}
                            <div className="shrink-0">
                                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl px-5 py-3 text-center">
                                    <div className="flex items-center gap-1 justify-center">
                                        <DollarSign className="h-5 w-5 text-emerald-500" />
                                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                            {doctor?.consultation_price || '0'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{isRtl ? 'سعر الكشفية' : 'Consultation Fee'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bio & Location */}
                    <div className="px-6 pb-6 space-y-5">
                        {/* Bio */}
                        {doctor?.bio && (
                            <div className="rounded-xl bg-muted/30 p-4 border border-muted">
                                <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                                    <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                        <UserPlus className="h-3.5 w-3.5 text-violet-500" />
                                    </div>
                                    {isRtl ? 'نبذة عن الطبيب' : 'About Doctor'}
                                </h3>
                                <p className="text-muted-foreground text-sm leading-relaxed ps-9">
                                    {doctor.bio}
                                </p>
                            </div>
                        )}

                        {/* Location */}
                        <div className="grid md:grid-cols-2 gap-5">
                            <div className="space-y-3">
                                <h3 className="font-semibold flex items-center gap-2 text-sm">
                                    <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                        <Building className="h-3.5 w-3.5 text-rose-500" />
                                    </div>
                                    {isRtl ? 'العنوان' : 'Address'}
                                </h3>
                                <div className="space-y-2 text-sm text-muted-foreground ps-9">
                                    {doctor?.location && (
                                        <div className="flex items-start gap-2">
                                            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" />
                                            <span>{doctor.location}</span>
                                        </div>
                                    )}
                                    {doctor?.landmark && (
                                        <div className="flex items-start gap-2">
                                            <Building className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" />
                                            <span>{isRtl ? 'نقطة دالة: ' : 'Landmark: '}{doctor.landmark}</span>
                                        </div>
                                    )}
                                    {!doctor?.location && !doctor?.landmark && (
                                        <span className="italic opacity-70">{isRtl ? 'لم يتم تحديد العنوان' : 'No address provided'}</span>
                                    )}
                                </div>
                            </div>

                            {/* Map */}
                            {doctor?.maps_link ? (
                                <a
                                    href={doctor.maps_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                                >
                                    <MapPin className="h-5 w-5" />
                                    <span className="font-medium">{isRtl ? 'عرض الموقع على خرائط جوجل' : 'View Location on Google Maps'}</span>
                                </a>
                            ) : (
                                <div className="p-4 bg-muted/30 rounded-xl flex items-center justify-center text-muted-foreground text-sm border border-dashed">
                                    <MapPin className="h-5 w-5 me-2 opacity-50" />
                                    {isRtl ? 'رابط الخريطة غير متوفر' : 'Map link not provided'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Booking Type ── */}
                <div className="rounded-2xl border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-muted/30">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm">{isRtl ? 'نوع الحجز' : 'Booking Type'}</h3>
                            <p className="text-xs text-muted-foreground">{isRtl ? 'اختر نوع الزيارة' : 'Select your visit type'}</p>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div
                                className={`cursor-pointer rounded-2xl border-2 p-5 flex flex-col items-center gap-3 transition-all duration-300
                                    ${bookingType === 'NEW'
                                        ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 shadow-lg shadow-blue-500/10'
                                        : 'border-muted hover:border-gray-300 hover:shadow-sm'}`}
                                onClick={() => setBookingType('NEW')}
                            >
                                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all ${bookingType === 'NEW' ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg' : 'bg-muted text-muted-foreground'}`}>
                                    <UserPlus className="h-7 w-7" />
                                </div>
                                <span className="font-semibold">{isRtl ? 'زيارة جديدة' : 'New Visit'}</span>
                                <span className="text-xs text-muted-foreground text-center">
                                    {isRtl ? 'أول زيارة لهذا الطبيب' : 'First time visiting'}
                                </span>
                            </div>
                            <div
                                className={`cursor-pointer rounded-2xl border-2 p-5 flex flex-col items-center gap-3 transition-all duration-300
                                    ${bookingType === 'FOLLOWUP'
                                        ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 shadow-lg shadow-purple-500/10'
                                        : 'border-muted hover:border-gray-300 hover:shadow-sm'}`}
                                onClick={() => setBookingType('FOLLOWUP')}
                            >
                                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all ${bookingType === 'FOLLOWUP' ? 'bg-gradient-to-br from-purple-500 to-violet-500 text-white shadow-lg' : 'bg-muted text-muted-foreground'}`}>
                                    <RefreshCw className="h-7 w-7" />
                                </div>
                                <span className="font-semibold">{isRtl ? 'مراجعة' : 'Follow-up'}</span>
                                <span className="text-xs text-muted-foreground text-center">
                                    {isRtl ? 'زيارة متابعة لحالة سابقة' : 'Follow-up visit'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>




                {/* ── Available Slots ── */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-1">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                            <CalendarDays className="h-5 w-5 text-white" />
                        </div>
                        <h2 className="text-xl font-bold">
                            {isRtl ? 'المواعيد المتاحة' : 'Available Appointments'}
                        </h2>
                    </div>

                    {slotsLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="relative">
                                <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                                <Sparkles className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                            </div>
                        </div>
                    ) : Object.keys(slotsByDate).length === 0 ? (
                        <div className="rounded-2xl border bg-card py-14 text-center">
                            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                                <Clock className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <p className="font-semibold">{isRtl ? 'لا توجد مواعيد متاحة حالياً' : 'No available slots'}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {isRtl ? 'الطبيب لم يحدد جدول دوامه بعد' : "Doctor hasn't set their schedule yet"}
                            </p>
                        </div>
                    ) : (
                        sortedDateKeys.map((dateKey) => {
                            const dayData = slotsByDate[dateKey]
                            const isBlocked = dayData === 'BLOCKED'

                            return (
                                <div key={dateKey} className={`rounded-2xl border overflow-hidden transition-all duration-300 ${isBlocked ? 'border-red-200 dark:border-red-900' : 'bg-card'}`}>
                                    <div
                                        className={`flex justify-between items-center px-5 py-3 border-b ${isBlocked ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/30 hover:bg-muted/50 cursor-pointer'} transition-colors`}
                                        onClick={() => !isBlocked && toggleDay(dateKey)}
                                    >
                                        <h3 className="font-semibold text-sm">
                                            {format(new Date(dateKey), 'EEEE, d MMMM', { locale: isRtl ? ar : enUS })}
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            {isBlocked ? (
                                                <span className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-800">
                                                    {isRtl ? 'الحجز متوقف' : 'Booking Stopped'}
                                                </span>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="gap-2 h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                    onClick={(e) => { e.stopPropagation(); toggleDay(dateKey); }}
                                                >
                                                    {expandedDays[dateKey] ? (
                                                        <>
                                                            <span className="font-medium text-xs">{isRtl ? 'إخفاء' : 'Hide'}</span>
                                                            <ChevronUp className="h-4 w-4" />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-medium text-xs">{isRtl ? 'إظهار' : 'Show'}</span>
                                                            <ChevronDown className="h-4 w-4" />
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {(isBlocked || expandedDays[dateKey]) && (
                                        <div className="p-5 animate-in slide-in-from-top-2 fade-in duration-200">
                                            {isBlocked ? (
                                                <div className="text-center py-4 text-red-500 font-medium">
                                                    <p>{isRtl ? 'نعتذر، الحجز غير متاح لهذا اليوم' : 'Sorry, booking is stopped for this day'}</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {dayData.map((slot, idx) => {
                                                        const isSelected = selectedSlot?.datetime === slot.datetime
                                                        const isFull = slot.is_full
                                                        return (
                                                            <button
                                                                key={idx}
                                                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                                                                ${isFull
                                                                        ? 'bg-red-50 dark:bg-red-950/20 text-red-400 border border-red-200 dark:border-red-800 cursor-not-allowed opacity-60'
                                                                        : isSelected
                                                                            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/20 scale-105'
                                                                            : 'bg-muted/50 hover:bg-primary/10 border border-transparent hover:border-primary/30 hover:shadow-sm'
                                                                    }`}
                                                                onClick={() => !isFull && setSelectedSlot(slot)}
                                                                disabled={isFull}
                                                            >
                                                                <Clock className="h-3.5 w-3.5" />
                                                                {format(parseISO(slot.datetime), 'h:mm a')}
                                                                {isFull ? (
                                                                    <span className="text-xs font-bold text-red-500">
                                                                        {isRtl ? 'مكتمل' : 'FULL'}
                                                                    </span>
                                                                ) : slot.booked_people > 0 && (
                                                                    <span className="text-xs opacity-70">
                                                                        ({slot.booked_people}/{slot.max_spots})
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                {/* ── Confirm Button ── */}
                <div className="sticky bottom-4 bg-background/80 backdrop-blur-md p-4 rounded-2xl border shadow-xl">
                    <Button
                        className={`w-full h-13 text-base rounded-xl font-semibold transition-all duration-300 ${selectedSlot && !hasActiveBooking
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 text-white shadow-lg'
                            : ''
                            }`}
                        disabled={!selectedSlot || bookMutation.isPending || hasActiveBooking}
                        onClick={() => bookMutation.mutate()}
                        size="lg"
                    >
                        {hasActiveBooking
                            ? (isRtl ? 'لديك حجز نشط بالفعل' : 'You have an active booking')
                            : bookMutation.isPending
                                ? (isRtl ? 'جاري الحجز...' : 'Booking...')
                                : selectedSlot
                                    ? (isRtl
                                        ? `تأكيد الحجز - ${format(parseISO(selectedSlot.datetime), 'p')}`
                                        : `Confirm Booking - ${format(parseISO(selectedSlot.datetime), 'p')}`)
                                    : (isRtl ? 'اختر موعداً' : 'Select a time slot')
                        }
                    </Button>
                </div>
            </div>
        </Layout>
    )
}

export default DoctorBookingPage
