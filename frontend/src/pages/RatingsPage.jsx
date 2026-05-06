import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import Layout from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { Star, User, Loader2, X, Trash2 } from 'lucide-react'

// Star Rating Component
const StarRating = ({ value, onChange, readonly = false }) => {
    const [hover, setHover] = useState(0)

    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    type="button"
                    disabled={readonly}
                    onClick={() => !readonly && onChange(star)}
                    onMouseEnter={() => !readonly && setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    className={`transition-transform ${readonly ? '' : 'hover:scale-110 cursor-pointer'}`}
                >
                    <Star
                        className={`h-8 w-8 ${star <= (hover || value)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                            }`}
                    />
                </button>
            ))}
        </div>
    )
}

// Rating Modal Component
const RatingModal = ({ isOpen, onClose, booking, isRtl, onSuccess }) => {
    const [stars, setStars] = useState(5)
    const [comment, setComment] = useState('')
    const queryClient = useQueryClient()

    const submitMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post('clinic/ratings/', {
                booking: booking.id,
                doctor: booking.doctor,
                stars: stars,
                comment: comment,
                is_public: true
            })
            return res.data
        },
        onSuccess: () => {
            toast.success(isRtl ? 'شكراً لتقييمك!' : 'Thank you for your rating!')
            queryClient.invalidateQueries(['myBookings'])
            queryClient.invalidateQueries(['myRatings'])
            onSuccess?.()
            onClose()
        },
        onError: (error) => {
            const msg = error.response?.data?.error || 'Failed to submit'
            toast.error(msg)
        }
    })

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">{isRtl ? 'تقييم الطبيب' : 'Rate Your Doctor'}</h3>
                    <button onClick={onClose}><X className="h-5 w-5" /></button>
                </div>

                <div className="text-center mb-6">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-3">
                        <User className="h-8 w-8" />
                    </div>
                    <h4 className="font-semibold text-lg">Dr. {booking?.doctor_name}</h4>
                </div>

                <div className="space-y-6">
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">{isRtl ? 'كيف كانت تجربتك؟' : 'How was your experience?'}</p>
                        <div className="flex justify-center"><StarRating value={stars} onChange={setStars} /></div>
                    </div>

                    <textarea
                        className="w-full p-3 border rounded-lg resize-none"
                        rows={3}
                        placeholder={isRtl ? 'تعليق (اختياري)...' : 'Comment (optional)...'}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />

                    <Button className="w-full" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                        {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRtl ? 'إرسال التقييم' : 'Submit Rating')}
                    </Button>
                </div>
            </div>
        </div>
    )
}

// Delete Confirmation Modal
const DeleteModal = ({ isOpen, onClose, onConfirm, isRtl, isPending }) => {
    if (!isOpen) return null
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg p-6 max-w-sm w-full mx-4">
                <h3 className="font-bold text-lg mb-4">{isRtl ? 'حذف التقييم؟' : 'Delete Rating?'}</h3>
                <p className="text-muted-foreground text-sm mb-6">
                    {isRtl ? 'هل أنت متأكد؟ لا يمكن التراجع.' : 'Are you sure? This cannot be undone.'}
                </p>
                <div className="flex gap-3">
                    <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isRtl ? 'حذف' : 'Delete')}
                    </Button>
                    <Button variant="outline" onClick={onClose}>{isRtl ? 'إلغاء' : 'Cancel'}</Button>
                </div>
            </div>
        </div>
    )
}

const RatingsPage = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const queryClient = useQueryClient()
    const [selectedBooking, setSelectedBooking] = useState(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [ratingToDelete, setRatingToDelete] = useState(null)

    const { data: bookings } = useQuery({
        queryKey: ['myBookings'],
        queryFn: async () => (await api.get('clinic/bookings/')).data
    })

    const { data: ratings, isLoading } = useQuery({
        queryKey: ['myRatings'],
        queryFn: async () => (await api.get('clinic/ratings/')).data
    })

    const deleteMutation = useMutation({
        mutationFn: async (ratingId) => {
            await api.delete(`clinic/ratings/${ratingId}/`)
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم حذف التقييم' : 'Rating deleted')
            queryClient.invalidateQueries(['myRatings'])
            setDeleteModalOpen(false)
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to delete')
        }
    })

    const ratedBookingIds = new Set(ratings?.map(r => r.booking) || [])
    const ratedDoctorIds = new Set(ratings?.map(r => r.doctor) || [])
    const pendingRatings = bookings?.filter(b => b.status === 'COMPLETED' && !ratedBookingIds.has(b.id) && !ratedDoctorIds.has(b.doctor)) || []

    const renderStars = (count) => (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`h-4 w-4 ${s <= count ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
            ))}
        </div>
    )

    return (
        <Layout>
            <div className="max-w-4xl mx-auto space-y-4 sm:space-y-8">
                <div className="text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold">{isRtl ? 'التقييمات' : 'Ratings'}</h1>
                    <p className="text-muted-foreground text-sm sm:text-base">{isRtl ? 'قيّم أطباءك' : 'Rate your doctors'}</p>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                    <>
                        {pendingRatings.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <Star className="h-5 w-5 text-yellow-500" />{isRtl ? 'بحاجة لتقييم' : 'Awaiting Your Rating'}
                                </h2>
                                {pendingRatings.map(booking => (
                                    <Card key={booking.id} className="border-yellow-200 bg-yellow-50/50">
                                        <CardContent className="p-4 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700">
                                                    <User className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold">Dr. {booking.doctor_name}</h3>
                                                    <p className="text-sm text-muted-foreground">{format(new Date(booking.booking_datetime), 'PPP')}</p>
                                                </div>
                                            </div>
                                            <Button onClick={() => { setSelectedBooking(booking); setModalOpen(true) }}>
                                                <Star className="h-4 w-4 mr-2" />{isRtl ? 'تقييم الآن' : 'Rate Now'}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold">{isRtl ? 'تقييماتك' : 'Your Ratings'}</h2>

                            {!ratings?.length ? (
                                <Card>
                                    <CardContent className="py-12 text-center text-muted-foreground">
                                        <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p>{isRtl ? 'لم تقم بأي تقييم' : 'No ratings yet'}</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                ratings.map(rating => (
                                    <Card key={rating.id}>
                                        <CardContent className="p-4 sm:p-6">
                                            <div className="flex items-start gap-4">
                                                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <User className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="font-semibold">Dr. {rating.doctor_name}</h3>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-muted-foreground">{format(new Date(rating.created_at), 'PPP')}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                                onClick={() => { setRatingToDelete(rating); setDeleteModalOpen(true) }}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 my-1">
                                                        {renderStars(rating.stars)}
                                                    </div>
                                                    {rating.comment && <p className="text-muted-foreground text-sm">{rating.comment}</p>}
                                                    {rating.doctor_response && (
                                                        <div className="mt-3 p-3 bg-muted rounded-lg">
                                                            <p className="text-xs font-medium text-muted-foreground mb-1">{isRtl ? 'رد الطبيب:' : "Doctor's response:"}</p>
                                                            <p className="text-sm">{rating.doctor_response}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            <RatingModal isOpen={modalOpen} onClose={() => setModalOpen(false)} booking={selectedBooking} isRtl={isRtl} />
            <DeleteModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={() => deleteMutation.mutate(ratingToDelete?.id)}
                isRtl={isRtl}
                isPending={deleteMutation.isPending}
            />
        </Layout>
    )
}

export default RatingsPage
