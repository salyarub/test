import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { Calendar, Clock, User, CheckCircle, XCircle, AlertCircle, Loader2, Users, Trash2, Star, RefreshCw } from 'lucide-react'

const MyBookingsPage = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const queryClient = useQueryClient()
    const [activeTab, setActiveTab] = useState('CONFIRMED')

    // Cancel Dialog State
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
    const [bookingToCancel, setBookingToCancel] = useState(null)

    // Rating Dialog State
    const [rateDialogOpen, setRateDialogOpen] = useState(false)
    const [bookingToRate, setBookingToRate] = useState(null)
    const [ratingStars, setRatingStars] = useState(5)
    const [ratingComment, setRatingComment] = useState('')

    // Re-rate Confirmation Dialog State
    const [reRateDialogOpen, setReRateDialogOpen] = useState(false)
    const [bookingToReRate, setBookingToReRate] = useState(null)

    // Helper to prevent date-fns crashes
    const safeFormat = (dateStr, pattern) => {
        try {
            if (!dateStr) return ''
            return format(new Date(dateStr), pattern)
        } catch (e) {
            console.error('Date parsing error:', e)
            return ''
        }
    }

    // Fetch user's bookings from REAL database - Real-time polling
    const { data: bookings, isLoading, error } = useQuery({
        queryKey: ['myBookings'],
        queryFn: async () => {
            const res = await api.get('clinic/bookings/')
            // Handle both paginated and non-paginated responses
            return Array.isArray(res.data) ? res.data : (res.data.results || [])
        },
        refetchInterval: 5000,
    })

    // Fetch patient's existing ratings to check which doctors are already rated
    const { data: myRatings } = useQuery({
        queryKey: ['myRatings'],
        queryFn: async () => (await api.get('clinic/ratings/')).data
    })

    const ratedDoctorIds = new Set(myRatings?.map(r => r.doctor) || [])

    const tabs = [
        { id: 'CONFIRMED', label: isRtl ? 'المؤكدة' : 'Confirmed', statuses: ['CONFIRMED', 'IN_PROGRESS'], icon: CheckCircle, color: 'text-blue-600 bg-blue-100' },
        { id: 'PENDING', label: isRtl ? 'قيد الانتظار' : 'Pending', statuses: ['PENDING', 'RESCHEDULING_PENDING'], icon: Clock, color: 'text-yellow-600 bg-yellow-100' },
        { id: 'COMPLETED', label: isRtl ? 'المنجزة' : 'Completed', statuses: ['COMPLETED'], icon: CheckCircle, color: 'text-green-600 bg-green-100' },
        { id: 'CANCELLED', label: isRtl ? 'الملغى' : 'Cancelled', statuses: ['CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED'], icon: XCircle, color: 'text-red-600 bg-red-100' },
    ]

    // Handle potential stale cache (paginated object) vs new fetch (array)
    const safeBookings = Array.isArray(bookings)
        ? bookings
        : (bookings?.results || [])

    // Helper: determine effective status (treat past active bookings correctly)
    const getEffectiveStatus = (booking) => {
        if (!booking || !booking.status) return booking?.status
        const bookingDate = new Date(booking.booking_datetime)
        bookingDate.setHours(23, 59, 59, 999) // End of booking day
        const isPast = bookingDate < new Date()
        
        if (isPast) {
            // Past PENDING/CONFIRMED → NO_SHOW (patient didn't show up)
            if (['PENDING', 'CONFIRMED'].includes(booking.status)) {
                return 'NO_SHOW'
            }
            // Past IN_PROGRESS → COMPLETED (doctor forgot to mark complete)
            if (booking.status === 'IN_PROGRESS') {
                return 'COMPLETED'
            }
        }
        return booking.status
    }

    const filteredBookings = safeBookings.filter(b =>
        b && b.status && tabs.find(t => t.id === activeTab).statuses.includes(getEffectiveStatus(b))
    )

    // Cancel booking mutation
    const cancelMutation = useMutation({
        mutationFn: async (bookingId) => {
            return api.post(`clinic/bookings/${bookingId}/patient_cancel/`)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم إلغاء الحجز بنجاح' : 'Booking cancelled successfully')
            queryClient.invalidateQueries(['myBookings'])
            setCancelDialogOpen(false)
            setBookingToCancel(null)
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || (isRtl ? 'فشل إلغاء الحجز' : 'Failed to cancel booking'))
        }
    })

    // Rate booking mutation
    const rateMutation = useMutation({
        mutationFn: async (data) => {
            return api.post('clinic/ratings/', data)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم إرسال التقييم بنجاح' : 'Rating submitted successfully')
            queryClient.invalidateQueries(['myBookings'])
            queryClient.invalidateQueries(['myRatings'])
            setRateDialogOpen(false)
            setBookingToRate(null)
            setRatingStars(5)
            setRatingComment('')
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || (isRtl ? 'فشل إرسال التقييم' : 'Failed to submit rating'))
        }
    })

    // Delete old rating then open new rating dialog
    const reRateMutation = useMutation({
        mutationFn: async (doctorId) => {
            const oldRating = myRatings?.find(r => r.doctor === doctorId)
            if (oldRating) {
                await api.delete(`clinic/ratings/${oldRating.id}/`)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['myBookings'])
            queryClient.invalidateQueries(['myRatings'])
            setReRateDialogOpen(false)
            // Open rating dialog for the new booking
            if (bookingToReRate) {
                setBookingToRate(bookingToReRate)
                setRatingStars(5)
                setRatingComment('')
                setRateDialogOpen(true)
                setBookingToReRate(null)
            }
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || (isRtl ? 'فشل حذف التقييم السابق' : 'Failed to delete previous rating'))
        }
    })

    const handleCancelClick = (booking) => {
        setBookingToCancel(booking)
        setCancelDialogOpen(true)
    }

    const confirmCancel = () => {
        if (bookingToCancel) {
            cancelMutation.mutate(bookingToCancel.id)
        }
    }

    const handleRateClick = (booking) => {
        setBookingToRate(booking)
        setRatingStars(5)
        setRatingComment('')
        setRateDialogOpen(true)
    }

    const submitRating = () => {
        if (bookingToRate) {
            rateMutation.mutate({
                booking: bookingToRate.id,
                doctor: bookingToRate.doctor, // Backend expects doctor ID
                stars: ratingStars,
                comment: ratingComment
            })
        }
    }

    const getStatusBadge = (status) => {
        const styles = {
            PENDING: { bg: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, label: isRtl ? 'قيد الانتظار' : 'Pending' },
            CONFIRMED: { bg: 'bg-blue-100 text-blue-800', icon: CheckCircle, label: isRtl ? 'مؤكد' : 'Confirmed' },
            COMPLETED: { bg: 'bg-green-100 text-green-800', icon: CheckCircle, label: isRtl ? 'مكتمل' : 'Completed' },
            CANCELLED: { bg: 'bg-red-100 text-red-800', icon: XCircle, label: isRtl ? 'ملغي' : 'Cancelled' },
            RESCHEDULING_PENDING: { bg: 'bg-orange-100 text-orange-800', icon: AlertCircle, label: isRtl ? 'إعادة جدولة' : 'Rescheduling' },
            NO_SHOW: { bg: 'bg-gray-100 text-gray-800', icon: XCircle, label: isRtl ? 'لم يحضر' : 'No Show' },
            EXPIRED: { bg: 'bg-gray-100 text-gray-600', icon: Clock, label: isRtl ? 'منتهي' : 'Expired' },
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

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-4 sm:space-y-8">
                <div className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold">{isRtl ? 'حجوزاتي' : 'My Bookings'}</h1>
                    <p className="text-muted-foreground text-sm sm:text-base">{isRtl ? 'عرض جميع مواعيدك' : 'View all your appointments'}</p>
                </div>

                {/* Tabs Navigation */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/50 p-1 rounded-xl">
                    {tabs.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200
                                    ${isActive
                                        ? 'bg-white text-primary shadow-sm ring-1 ring-black/5 dark:bg-gray-800 dark:text-gray-100'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                    }
                                `}
                            >
                                <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'opacity-70'}`} />
                                {tab.label}
                                {safeBookings && (
                                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {safeBookings.filter(b => b && b.status && tab.statuses.includes(getEffectiveStatus(b))).length}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : error ? (
                    <Card>
                        <CardContent className="py-12 text-center text-destructive">
                            <p>{isRtl ? 'حدث خطأ في تحميل الحجوزات' : 'Error loading bookings'}</p>
                            <p className="text-sm mt-2">{error.message}</p>
                        </CardContent>
                    </Card>
                ) : !bookings || bookings.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-muted-foreground">
                            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>{isRtl ? 'لا توجد أي حجوزات' : 'No bookings found'}</p>
                            <Link to="/patient">
                                <Button className="mt-4">
                                    {isRtl ? 'احجز موعد الآن' : 'Book Now'}
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : filteredBookings.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="py-12 text-center text-muted-foreground">
                            <div className={`h-12 w-12 mx-auto mb-4 rounded-full flex items-center justify-center bg-muted`}>
                                {(() => {
                                    const TabIcon = tabs.find(t => t.id === activeTab)?.icon || Calendar
                                    return <TabIcon className="h-6 w-6 opacity-50" />
                                })()}
                            </div>
                            <p>
                                {isRtl
                                    ? `لا توجد حجوزات في قائمة ${tabs.find(t => t.id === activeTab)?.label}`
                                    : `No ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()} bookings`
                                }
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {filteredBookings.map(booking => {
                            if (!booking) return null
                            return (
                                <Card key={booking.id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4 sm:p-6">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                    <User className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-base sm:text-lg">
                                                        Dr. {booking.doctor_name || 'Doctor'}
                                                    </h3>
                                                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                                                        <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded">
                                                            <Calendar className="h-3.5 w-3.5" />
                                                            {safeFormat(booking.booking_datetime, 'PPP')}
                                                        </span>
                                                        <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded">
                                                            <Clock className="h-3.5 w-3.5" />
                                                            {safeFormat(booking.booking_datetime, 'p')}
                                                        </span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${booking.booking_type === 'FOLLOWUP' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-teal-100 text-teal-700 border border-teal-200'}`}>
                                                            {booking.booking_type === 'FOLLOWUP' ? (isRtl ? 'مراجعة' : 'Follow-up') : (isRtl ? 'زيارة جديدة' : 'New Visit')}
                                                        </span>
                                                        {booking.number_of_people > 1 && (
                                                            <span className="flex items-center gap-1 text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
                                                                <Users className="h-3.5 w-3.5" />
                                                                {booking.number_of_people} {isRtl ? 'أشخاص' : 'people'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-4 md:pt-0">
                                                {getStatusBadge(getEffectiveStatus(booking))}

                                                <div className="flex flex-wrap justify-end gap-2">
                                                    {['PENDING', 'CONFIRMED'].includes(getEffectiveStatus(booking)) && (() => {
                                                        const bookingTime = new Date(booking.booking_datetime)
                                                        const createdAt = new Date(booking.created_at)
                                                        const now = new Date()
                                                        const msUntilBooking = bookingTime - now
                                                        const msSinceCreation = now - createdAt
                                                        const isLocked = msUntilBooking <= 24 * 60 * 60 * 1000 && msSinceCreation > 10 * 60 * 1000

                                                        if (isLocked) return (
                                                            <span className="text-xs text-red-500 flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                                                                <XCircle className="h-3 w-3" />
                                                                {isRtl ? 'مقفل' : 'Locked'}
                                                            </span>
                                                        )
                                                        return (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                                                                onClick={() => handleCancelClick(booking)}
                                                            >
                                                                <Trash2 className="h-4 w-4 mr-1" />
                                                                {isRtl ? 'إلغاء' : 'Cancel'}
                                                            </Button>
                                                        )
                                                    })()}
                                                    {booking.status === 'COMPLETED' && !booking.is_rated && !ratedDoctorIds.has(booking.doctor) && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleRateClick(booking)}
                                                        >
                                                            <Star className="h-4 w-4 mr-1 text-yellow-500" />
                                                            {isRtl ? 'تقييم' : 'Rate'}
                                                        </Button>
                                                    )}
                                                    {booking.status === 'COMPLETED' && (booking.is_rated || ratedDoctorIds.has(booking.doctor)) && (
                                                        <>
                                                            <div className="flex items-center gap-1 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-md text-sm font-medium border border-yellow-200">
                                                                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                                                                {isRtl ? 'تم التقييم' : 'Rated'}
                                                            </div>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                                                                onClick={() => { setBookingToReRate(booking); setReRateDialogOpen(true) }}
                                                            >
                                                                <RefreshCw className="h-4 w-4 mr-1" />
                                                                {isRtl ? 'إعادة التقييم' : 'Re-rate'}
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                )}

                {/* Cancel Confirmation Dialog */}
                <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-red-600 flex items-center gap-2">
                                <Trash2 className="h-5 w-5" />
                                {isRtl ? 'تأكيد إلغاء الحجز' : 'Confirm Cancellation'}
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                {isRtl
                                    ? 'هل أنت متأكد من إلغاء هذا الحجز؟ لا يمكن التراجع عن هذا الإجراء.'
                                    : 'Are you sure you want to cancel this booking? This action cannot be undone.'
                                }
                            </DialogDescription>
                        </DialogHeader>
                        {bookingToCancel && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border">
                                <p className="font-semibold text-lg">Dr. {bookingToCancel.doctor_name}</p>
                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-300">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="h-4 w-4" />
                                        {safeFormat(bookingToCancel.booking_datetime, 'PPP')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-4 w-4" />
                                        {safeFormat(bookingToCancel.booking_datetime, 'p')}
                                    </span>
                                </div>
                            </div>
                        )}
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                                {isRtl ? 'تراجع' : 'Go Back'}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={confirmCancel}
                                disabled={cancelMutation.isPending}
                            >
                                {cancelMutation.isPending
                                    ? (isRtl ? 'جاري الإلغاء...' : 'Cancelling...')
                                    : (isRtl ? 'نعم، إلغاء الحجز' : 'Yes, Cancel Booking')
                                }
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Rating Dialog */}
                <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                                {isRtl ? 'تقييم زيارتك' : 'Rate Your Visit'}
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                {isRtl
                                    ? 'كيف كانت تجربتك مع الطبيب؟'
                                    : 'How was your experience with the doctor?'
                                }
                            </DialogDescription>
                        </DialogHeader>

                        {bookingToRate && (
                            <div className="space-y-6 py-4">
                                <div className="text-center">
                                    <p className="font-semibold text-lg">Dr. {bookingToRate.doctor_name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {safeFormat(bookingToRate.booking_datetime, 'PPP')}
                                    </p>
                                </div>

                                {/* Stars */}
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setRatingStars(star)}
                                            className="focus:outline-none transition-transform hover:scale-110"
                                        >
                                            <Star
                                                className={`h-8 w-8 ${star <= ratingStars
                                                    ? 'text-yellow-500 fill-yellow-500'
                                                    : 'text-gray-300'
                                                    }`}
                                            />
                                        </button>
                                    ))}
                                </div>

                                {/* Comment */}
                                <div className="space-y-2">
                                    <Label>{isRtl ? 'تعليقك (اختياري)' : 'Your Comment (Optional)'}</Label>
                                    <textarea
                                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        placeholder={isRtl ? 'اكتب تعليقك هنا...' : 'Write your review here...'}
                                        value={ratingComment}
                                        onChange={(e) => setRatingComment(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setRateDialogOpen(false)}>
                                {isRtl ? 'إلغاء' : 'Cancel'}
                            </Button>
                            <Button
                                onClick={submitRating}
                                disabled={rateMutation.isPending}
                            >
                                {rateMutation.isPending
                                    ? (isRtl ? 'جاري الإرسال...' : 'Submitting...')
                                    : (isRtl ? 'إرسال التقييم' : 'Submit Rating')
                                }
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Re-rate Confirmation Dialog */}
                <Dialog open={reRateDialogOpen} onOpenChange={setReRateDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-orange-600 flex items-center gap-2">
                                <RefreshCw className="h-5 w-5" />
                                {isRtl ? 'إعادة التقييم' : 'Re-rate Doctor'}
                            </DialogTitle>
                            <DialogDescription className="pt-2">
                                {isRtl
                                    ? 'سيؤدي هذا إلى حذف تقييمك السابق لهذا الطبيب واستبداله بتقييم جديد. هل أنت متأكد؟'
                                    : 'This will delete your previous rating for this doctor and replace it with a new one. Are you sure?'
                                }
                            </DialogDescription>
                        </DialogHeader>
                        {bookingToReRate && (
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                                <p className="font-semibold text-lg">Dr. {bookingToReRate.doctor_name}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {isRtl ? 'سيتم حذف تقييمك السابق نهائياً' : 'Your previous rating will be permanently deleted'}
                                </p>
                            </div>
                        )}
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setReRateDialogOpen(false)}>
                                {isRtl ? 'إلغاء' : 'Cancel'}
                            </Button>
                            <Button
                                className="bg-orange-500 hover:bg-orange-600 text-white"
                                onClick={() => reRateMutation.mutate(bookingToReRate?.doctor)}
                                disabled={reRateMutation.isPending}
                            >
                                {reRateMutation.isPending
                                    ? (isRtl ? 'جاري الحذف...' : 'Deleting...')
                                    : (isRtl ? 'نعم، إعادة التقييم' : 'Yes, Re-rate')
                                }
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </Layout>
    )
}

export default MyBookingsPage
