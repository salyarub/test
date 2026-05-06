from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Booking, Rating, ActivityLog
from .serializers import BookingSerializer, RatingSerializer, ActivityLogSerializer
from users.models import User
from django.db.models import Avg

# Helper for logging
def log_activity(actor, doctor, action_type, description, target_id=None):
    ActivityLog.objects.create(
        actor=actor,
        doctor=doctor,
        action_type=action_type,
        description=description,
        target_id=target_id
    )

class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        # Doctors see logs for their clinic
        if self.request.user.role == User.Role.DOCTOR:
            return ActivityLog.objects.filter(doctor=self.request.user.doctor_profile).order_by('-created_at')
        return ActivityLog.objects.none()

class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Use select_related to optimize - reduces N+1 queries
        base_qs = Booking.objects.select_related(
            'doctor', 'doctor__user', 
            'patient', 'patient__user'
        ).order_by('-booking_datetime')
        
        from django.utils import timezone
        from django.core.cache import cache
        
        # Lazy update: auto-expire past bookings (runs max once per hour via cache)
        cache_key = 'lazy_update_bookings_last_run'
        if not cache.get(cache_key):
            today = timezone.now().date()
            
            # PENDING/CONFIRMED → NO_SHOW (patient didn't show up)
            Booking.objects.filter(
                booking_datetime__date__lt=today,
                status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED]
            ).update(status=Booking.Status.NO_SHOW)
            
            # IN_PROGRESS → COMPLETED (exam started but doctor forgot to mark complete)
            Booking.objects.filter(
                booking_datetime__date__lt=today,
                status=Booking.Status.IN_PROGRESS
            ).update(status=Booking.Status.COMPLETED)
            
            cache.set(cache_key, True, 3600)  # Cache for 1 hour

        if user.role == User.Role.DOCTOR:
            return base_qs.filter(doctor__user=user)
        elif user.role == User.Role.PATIENT:
            return base_qs.filter(patient__user=user)
        elif user.role == User.Role.SECRETARY:
            return base_qs.filter(doctor=user.secretary_profile.doctor)
        return Booking.objects.none()

    def perform_create(self, serializer):
        from django.db import transaction
        from rest_framework.exceptions import ValidationError
        from clinic.booking_validation import BookingValidator
        from scheduling.models import DoctorAvailability
        from django.db.models import Sum
        from datetime import timedelta
        
        user = self.request.user
        if user.role == User.Role.PATIENT:
            doctor = serializer.validated_data['doctor']
            booking_datetime = serializer.validated_data['booking_datetime']
            number_of_people = serializer.validated_data.get('number_of_people', 1)
            patient = user.patient_profile
            
            # Check for active time-off (blocks)
            from scheduling.models import TimeOff
            booking_date = booking_datetime.date()
            is_blocked = TimeOff.objects.filter(
                doctor=doctor,
                status='ACTIVE',
                type__in=['ABSENCE', 'EMERGENCY', 'DIGITAL_UNAVAILABLE'],
                start_date__lte=booking_date,
                end_date__gte=booking_date
            ).exists()
            
            if is_blocked:
                 raise ValidationError({
                    'error': 'Doctor is on leave/stopped for this day.', 
                    'error_ar': 'الطبيب في إجازة أو متوقف عن العمل في هذا اليوم.'
                 })
            
            # Validate number of people (max 5)
            if number_of_people < 1 or number_of_people > 5:
                raise ValidationError({'error': 'عدد الأشخاص يجب أن يكون بين 1 و 5'})
            
            # Lazy update first to ensure we don't block on yesterday's missed appointments
            from django.utils import timezone
            today = timezone.now().date()
            past_pending = Booking.objects.filter(
                patient=patient,
                booking_datetime__date__lt=today,
                status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED]
            )
            if past_pending.exists():
                past_pending.update(status=Booking.Status.NO_SHOW)
            
            # Auto-complete past IN_PROGRESS
            Booking.objects.filter(
                patient=patient,
                booking_datetime__date__lt=today,
                status=Booking.Status.IN_PROGRESS
            ).update(status=Booking.Status.COMPLETED)

            # Check for any active booking with this doctor today or in the future
            # Patient can only have ONE active booking with a doctor at any time
            active_statuses = [Booking.Status.PENDING, Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS, 'RESCHEDULING_PENDING']
            existing_active = Booking.objects.filter(
                patient=patient,
                doctor=doctor,
                status__in=active_statuses,
                booking_datetime__date__gte=today
            ).exists()
            
            if existing_active:
                raise ValidationError({
                    'error': 'لديك حجز نشط بالفعل عند هذا الطبيب. لا يمكنك الحجز مجدداً إلا بعد إلغاء أو إتمام الحجز الحالي.',
                    'error_en': 'You already have an active booking with this doctor. You can only book again after the current booking is cancelled or completed.'
                })
            
            # Get slot duration from availability
            python_day = booking_datetime.weekday()
            model_day = 0 if python_day == 6 else python_day + 1
            availability = DoctorAvailability.objects.filter(
                doctor=doctor,
                day_of_week=model_day,
                is_available=True
            ).first()
            slot_duration = availability.slot_duration if availability else 30
            max_per_slot = availability.max_patients_per_slot if availability else 1
            
            with transaction.atomic():
                bookings_created = []
                remaining_people = number_of_people
                current_slot = booking_datetime
                
                while remaining_people > 0:
                    # Check current slot capacity
                    existing_people_result = Booking.objects.select_for_update().filter(
                        doctor=doctor,
                        booking_datetime=current_slot
                    ).exclude(status=Booking.Status.CANCELLED).aggregate(total=Sum('number_of_people'))
                    existing_people = existing_people_result['total'] or 0
                    
                    available_in_slot = max(0, max_per_slot - existing_people)
                    
                    if available_in_slot <= 0:
                        # Try next slot
                        current_slot = current_slot + timedelta(minutes=slot_duration)
                        # Safety: don't go more than 5 slots ahead
                        if (current_slot - booking_datetime).total_seconds() > slot_duration * 60 * 5:
                            raise ValidationError({'error': 'لا توجد مواعيد متاحة كافية لهذا العدد من الأشخاص'})
                        continue
                    
                    # Book as many people as possible in this slot
                    people_this_slot = min(remaining_people, available_in_slot)
                    
                    initial_status = Booking.Status.CONFIRMED
                    
                    booking = Booking.objects.create(
                        doctor=doctor,
                        patient=patient,
                        booking_datetime=current_slot,
                        booking_type=serializer.validated_data.get('booking_type', 'NEW'),
                        number_of_people=people_this_slot,
                        status=initial_status,
                        patient_notes=serializer.validated_data.get('patient_notes', '')
                    )
                    bookings_created.append(booking)
                    
                    remaining_people -= people_this_slot
                    current_slot = current_slot + timedelta(minutes=slot_duration)
            
            # Log and notify for first/main booking only
            main_booking = bookings_created[0]
            people_text = f" ({number_of_people} أشخاص)" if number_of_people > 1 else ""
            slots_text = f" (تم توزيعهم على {len(bookings_created)} مواعيد)" if len(bookings_created) > 1 else ""
            
            log_activity(
                actor=user, 
                doctor=main_booking.doctor, 
                action_type='BOOKING_CREATED', 
                description=f"New booking created by {user.first_name} {user.last_name}{people_text}{slots_text}", 
                target_id=main_booking.id
            )
            
            from notifications.views import create_notification
            create_notification(
                'doctor',
                doctor,
                'NEW_BOOKING',
                f'تم حجز موعد من قبل {user.first_name} {user.last_name}{people_text} بتاريخ {main_booking.booking_datetime.strftime("%Y-%m-%d %H:%M")}{slots_text}',
                related_object_id=main_booking.id
            )
            
            # Build confirmation message for patient
            if len(bookings_created) == 1:
                patient_msg = f'تم حجز موعدك مع د. {doctor.user.first_name} {doctor.user.last_name} بتاريخ {main_booking.booking_datetime.strftime("%Y-%m-%d %H:%M")}{people_text}'
            else:
                times = [b.booking_datetime.strftime("%H:%M") for b in bookings_created]
                patient_msg = f'تم حجز {number_of_people} أشخاص مع د. {doctor.user.first_name} على المواعيد: {", ".join(times)}'
            
            create_notification(
                'patient',
                user.patient_profile,
                'BOOKING_CREATED',
                patient_msg,
                related_object_id=main_booking.id
            )

    def perform_update(self, serializer):
        user = self.request.user
        
        # If booking_datetime is being changed
        if 'booking_datetime' in serializer.validated_data:
            new_datetime = serializer.validated_data['booking_datetime']
            doctor = serializer.instance.doctor # Doctor doesn't change usually
            
            # Check for active time-off (blocks)
            from scheduling.models import TimeOff
            from rest_framework.exceptions import ValidationError
            
            booking_date = new_datetime.date()
            is_blocked = TimeOff.objects.filter(
                doctor=doctor,
                status='ACTIVE',
                type__in=['ABSENCE', 'EMERGENCY', 'DIGITAL_UNAVAILABLE'],
                start_date__lte=booking_date,
                end_date__gte=booking_date
            ).exists()
            
            if is_blocked:
                 raise ValidationError({
                    'error': 'Doctor is on leave/stopped for this day.', 
                    'error_ar': 'الطبيب في إجازة أو متوقف عن العمل في هذا اليوم.'
                 })
                 
        serializer.save()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        booking = self.get_object()
        if request.user.role not in [User.Role.DOCTOR, User.Role.SECRETARY]:
            return Response({'error': 'Not authorized'}, status=403)
        
        booking.status = Booking.Status.CONFIRMED
        booking.save()
        
        # Get patient name for logging
        if booking.is_walkin:
            patient_name = booking.walkin_patient_name
        else:
            patient_name = f"{booking.patient.user.first_name} {booking.patient.user.last_name}" if booking.patient else "Unknown"
        
        # Log Activity
        log_activity(
            actor=request.user,
            doctor=booking.doctor,
            action_type='BOOKING_APPROVED',
            description=f"Booking for {patient_name} was approved by {request.user.first_name} {request.user.last_name}",
            target_id=booking.id
        )
        
        # Notify patient (only if not walk-in)
        if booking.patient:
            from notifications.views import create_notification
            create_notification(
                'patient',
                booking.patient,
                'BOOKING_CONFIRMED',
                f'Your appointment with Dr. {booking.doctor.user.first_name} {booking.doctor.user.last_name} on {booking.booking_datetime.strftime("%Y-%m-%d %H:%M")} has been confirmed!'
            )
        
        return Response({'status': 'confirmed'})

    @action(detail=True, methods=['post'])
    def start_examination(self, request, pk=None):
        """Mark booking as in progress (examination started)"""
        booking = self.get_object()
        if request.user.role not in [User.Role.DOCTOR, User.Role.SECRETARY]:
            return Response({'error': 'Not authorized'}, status=403)
        
        # Date validation: can only start examination on or after booking date
        from django.utils import timezone
        today = timezone.now().date()
        booking_date = booking.booking_datetime.date()
        
        if today < booking_date:
            return Response({
                'error': 'Cannot start examination before the booking date',
                'error_ar': 'لا يمكن بدء الفحص قبل تاريخ الموعد'
            }, status=400)
        
        booking.status = Booking.Status.IN_PROGRESS
        booking.save()
        
        # Log Activity
        patient_name = booking.walkin_patient_name if booking.is_walkin else f"{booking.patient.user.first_name} {booking.patient.user.last_name}"
        log_activity(
            actor=request.user,
            doctor=booking.doctor,
            action_type='EXAM_STARTED',
            description=f"Examination started for {patient_name} by {request.user.first_name} {request.user.last_name}",
            target_id=booking.id
        )
        
        return Response({'status': 'in_progress'})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark booking as completed"""
        booking = self.get_object()
        if request.user.role not in [User.Role.DOCTOR, User.Role.SECRETARY]:
            return Response({'error': 'Not authorized'}, status=403)
        
        booking.status = Booking.Status.COMPLETED
        booking.doctor_notes = request.data.get('notes', '')
        booking.save()
        
        # Get patient name for logging
        if booking.is_walkin:
            patient_name = booking.walkin_patient_name
        else:
            patient_name = f"{booking.patient.user.first_name} {booking.patient.user.last_name}" if booking.patient else "Unknown"
        
        # Log Activity
        log_activity(
            actor=request.user,
            doctor=booking.doctor,
            action_type='EXAM_COMPLETED',
            description=f"Examination completed for {patient_name} by {request.user.first_name} {request.user.last_name}",
            target_id=booking.id
        )
        
        # Notify patient to rate (only if not walk-in)
        if booking.patient:
            from notifications.views import create_notification
            create_notification(
                'patient',
                booking.patient,
                'APPOINTMENT_COMPLETED',
                f'Your appointment with Dr. {booking.doctor.user.first_name} {booking.doctor.user.last_name} is complete. Please share your experience by leaving a rating!'
            )
        
        return Response({'status': 'completed'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel booking with optional message to patient"""
        booking = self.get_object()
        
        # Get cancellation message
        custom_message = request.data.get('message', '')
        use_auto_message = request.data.get('auto_message', True)
        
        # Set cancellation reason
        if custom_message:
            booking.cancellation_reason = custom_message
        else:
            booking.cancellation_reason = 'Cancelled by clinic'
        
        booking.status = Booking.Status.CANCELLED
        booking.save()
        
        # Get patient name for logging
        if booking.is_walkin:
            patient_name = booking.walkin_patient_name
        else:
            patient_name = f"{booking.patient.user.first_name} {booking.patient.user.last_name}" if booking.patient else "Unknown"
        
        # Log Activity
        log_activity(
            actor=request.user,
            doctor=booking.doctor,
            action_type='BOOKING_CANCELLED',
            description=f"Booking for {patient_name} was cancelled by {request.user.first_name} {request.user.last_name}",
            target_id=booking.id
        )
        
        # Send notification to patient (only if not walk-in)
        if booking.patient:
            from notifications.views import create_notification
            
            if custom_message:
                message = f'Your appointment on {booking.booking_datetime.strftime("%Y-%m-%d %H:%M")} has been cancelled. Message from Dr. {booking.doctor.user.first_name}: "{custom_message}"'
            else:
                message = f'We apologize, but your appointment with Dr. {booking.doctor.user.first_name} {booking.doctor.user.last_name} on {booking.booking_datetime.strftime("%Y-%m-%d %H:%M")} has been cancelled. We sincerely apologize for any inconvenience. Please book a new appointment at your convenience.'
            
            create_notification(
                'patient',
                booking.patient,
                'BOOKING_CANCELLED',
                message
            )
        
        return Response({'status': 'cancelled'})
    
    @action(detail=True, methods=['post'])
    def patient_cancel(self, request, pk=None):
        """Allow patient to cancel their own booking"""
        booking = self.get_object()
        user = request.user
        
        # Verify the booking belongs to this patient
        if user.role != User.Role.PATIENT:
            return Response({'error': 'Only patients can use this endpoint'}, status=403)
        
        if not booking.patient or booking.patient != user.patient_profile:
            return Response({'error': 'You can only cancel your own bookings'}, status=403)
        
        # Check if booking is cancellable (not already cancelled, completed, etc.)
        non_cancellable = [Booking.Status.CANCELLED, Booking.Status.COMPLETED, Booking.Status.IN_PROGRESS]
        if booking.status in non_cancellable:
            return Response({'error': 'This booking cannot be cancelled'}, status=400)
        
        # ── Cancellation Policy: 24-hour lock with 10-minute grace period ──
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        time_until_booking = booking.booking_datetime - now
        time_since_creation = now - booking.created_at
        grace_period = timedelta(minutes=10)
        lock_threshold = timedelta(hours=24)
        
        # If booking is within 24 hours AND grace period (10 min) has passed → BLOCK
        if time_until_booking <= lock_threshold and time_since_creation > grace_period:
            return Response({
                'error': 'لا يمكنك إلغاء الحجز قبل الموعد بأقل من 24 ساعة',
                'error_en': 'Cannot cancel a booking less than 24 hours before the appointment',
                'locked': True
            }, status=400)
        
        booking.status = Booking.Status.CANCELLED
        booking.cancellation_reason = 'Cancelled by patient'
        booking.save()
        
        # Log Activity
        log_activity(
            actor=user,
            doctor=booking.doctor,
            action_type='BOOKING_CANCELLED',
            description=f"Booking was cancelled by patient {user.first_name} {user.last_name}",
            target_id=booking.id
        )
        
        # Notify doctor
        from notifications.views import create_notification
        create_notification(
            'doctor',
            booking.doctor,
            'BOOKING_CANCELLED',
            f"المريض {user.first_name} {user.last_name} قام بإلغاء موعده يوم {booking.booking_datetime.strftime('%Y-%m-%d')} الساعة {booking.booking_datetime.strftime('%H:%M')}"
        )
        
        return Response({'status': 'cancelled', 'message': 'تم إلغاء الحجز بنجاح'})
    
    @action(detail=False, methods=['post'])
    def add_walkin(self, request):
        """Add a walk-in patient who hasn't registered digitally"""
        user = request.user
        
        # Determine doctor
        if user.role == User.Role.DOCTOR:
            doctor = user.doctor_profile
        elif user.role == User.Role.SECRETARY:
            if 'add_walkin_patient' not in user.secretary_profile.permissions:
                return Response({'error': 'No permission to add walk-in patients'}, status=403)
            doctor = user.secretary_profile.doctor
        else:
            return Response({'error': 'Not authorized'}, status=403)
        
        # Get data
        patient_name = request.data.get('patient_name', '').strip()
        patient_phone = request.data.get('patient_phone', '').strip()
        notes = request.data.get('notes', '')
        
        if not patient_name:
            return Response({'error': 'Patient name is required'}, status=400)
            
        # Get booking date (optional, default to today)
        from django.utils import timezone
        from datetime import datetime as dt, time
        
        # Check if specific datetime was selected (from slot picker)
        booking_datetime_str = request.data.get('booking_datetime')
        booking_date_str = request.data.get('booking_date')
        
        if booking_datetime_str:
            # Use the specific datetime from slot picker
            try:
                # Parse ISO format datetime
                booking_datetime = dt.fromisoformat(booking_datetime_str.replace('Z', '+00:00'))
                if timezone.is_naive(booking_datetime):
                    booking_datetime = timezone.make_aware(booking_datetime)
                booking_date = booking_datetime.date()
            except:
                return Response({'error': 'Invalid datetime format'}, status=400)
        elif booking_date_str:
            try:
                booking_date = dt.strptime(booking_date_str, '%Y-%m-%d').date()
                if booking_date == timezone.now().date():
                    booking_datetime = timezone.now()
                else:
                    booking_datetime = timezone.make_aware(dt.combine(booking_date, time(9, 0)))
            except ValueError:
                return Response({'error': 'Invalid date format'}, status=400)
        else:
            booking_date = timezone.now().date()
            booking_datetime = timezone.now()

        today = booking_date
        
        python_weekday = today.weekday() # Mon=0, Sun=6
        model_weekday = (python_weekday + 1) % 7 # Sun=0, Mon=1...
        
        # Check for active time-off (blocks)
        from scheduling.models import TimeOff
        is_blocked = TimeOff.objects.filter(
            doctor=doctor,
            status='ACTIVE',
            type__in=['ABSENCE', 'EMERGENCY', 'DIGITAL_UNAVAILABLE'],
            start_date__lte=booking_date,
            end_date__gte=booking_date
        ).exists()
        
        if is_blocked:
             return Response({
                'error': 'Doctor is on leave/stopped for this day.', 
                'error_ar': 'الطبيب في إجازة أو متوقف عن العمل في هذا اليوم.'
             }, status=400)
        
        # Check if doctor works today
        from scheduling.models import DoctorAvailability
        availability = DoctorAvailability.objects.filter(
            doctor=doctor, 
            day_of_week=model_weekday,
            is_available=True
        ).exists()
        
        if not availability:
            days_map = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            day_name = days_map[model_weekday]
            return Response({
                'error': f'Doctor is not working on {day_name} ({today}).',
                'error_ar': f'الطبيب لا يعمل في يوم {days_map[model_weekday]} الموافق {today}.',
                'debug_info': f'Day Index: {model_weekday}'
            }, status=400)
            
        # Calculate daily capacity: (working hours / slot duration) × max_patients_per_slot
        day_availabilities = DoctorAvailability.objects.filter(
            doctor=doctor,
            day_of_week=model_weekday,
            is_available=True
        )
        
        from datetime import datetime as dt, timedelta
        daily_capacity = 0
        last_regular_slot_time = None
        
        for av in day_availabilities:
            start = dt.combine(today, av.start_time)
            end = dt.combine(today, av.end_time)
            working_minutes = (end - start).total_seconds() / 60
            num_slots = int(working_minutes / av.slot_duration) if av.slot_duration > 0 else 0
            daily_capacity += num_slots * av.max_patients_per_slot
            
            # Calculate last regular slot time
            if num_slots > 0:
                slot_end = start + timedelta(minutes=av.slot_duration * num_slots)
                if last_regular_slot_time is None or slot_end > last_regular_slot_time:
                    last_regular_slot_time = slot_end
        
        if daily_capacity == 0:
            return Response({
                'error': 'No capacity configured for this day.',
                'error_ar': 'لم يتم تحديد سعة لهذا اليوم.'
            }, status=400)
        
        # Check if booking time has passed (expired) - only for non-overflow slots
        now = timezone.now()
        is_overflow_booking = False
        
        if last_regular_slot_time:
            last_regular_aware = timezone.make_aware(last_regular_slot_time)
            is_overflow_booking = booking_datetime >= last_regular_aware
        
        # Block booking in the past for non-overflow slots
        if not is_overflow_booking and booking_datetime < now:
            return Response({
                'error': 'Cannot book in expired time slot.',
                'error_ar': 'لا يمكن الحجز في وقت منتهي.'
            }, status=400)
        
        # Check current bookings
        current_count = Booking.objects.filter(
            doctor=doctor,
            booking_datetime__date=today
        ).exclude(status=Booking.Status.CANCELLED).count()
        
        if current_count >= daily_capacity and not doctor.allow_overbooking:
            return Response({
                'error': f'Daily limit reached ({daily_capacity} patients). Overbooking is disabled.',
                'error_ar': f'تم الوصول للحد اليومي ({daily_capacity} مريض). الطبيب لا يسمح بالإضافة فوق الحد.'
            }, status=400)
        
        # Create a walk-in booking (directly confirmed)
        booking = Booking.objects.create(
            doctor=doctor,
            patient=None,  # No linked patient account
            booking_datetime=booking_datetime,
            booking_type=Booking.BookingType.NEW,
            status=Booking.Status.CONFIRMED,
            is_walkin=True,
            walkin_patient_name=patient_name,
            walkin_patient_phone=patient_phone,
            doctor_notes=notes,
            is_overflow=is_overflow_booking
        )
        
        # Log the activity
        log_activity(
            actor=user,
            doctor=doctor,  # Use the doctor variable we already have
            action_type='WALKIN_ADDED',
            description=f"Walk-in patient '{patient_name}' added by {user.first_name} {user.last_name}",
            target_id=booking.id
        )
        
        return Response({
            'status': 'success',
            'booking_id': booking.id,
            'message': f'Walk-in patient {patient_name} added to queue'
        })


class RatingViewSet(viewsets.ModelViewSet):
    serializer_class = RatingSerializer
    
    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'respond']:
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        user = self.request.user
        doctor_id = self.request.query_params.get('doctor_id')
        
        # Filter by doctor if requested
        if doctor_id:
            return Rating.objects.filter(doctor_id=doctor_id, is_public=True)
        
        # If authenticated patient, return their ratings
        if user.is_authenticated and user.role == User.Role.PATIENT:
            return Rating.objects.filter(patient=user.patient_profile)
        
        # If authenticated doctor, return ratings for them
        if user.is_authenticated and user.role == User.Role.DOCTOR:
            return Rating.objects.filter(doctor=user.doctor_profile)
        
        return Rating.objects.filter(is_public=True)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != User.Role.PATIENT:
            raise permissions.PermissionDenied("Only patients can create ratings")
        
        # Check if already rated this booking
        booking_id = self.request.data.get('booking')
        if Rating.objects.filter(booking_id=booking_id).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"error": "You have already rated this appointment"})
        
        serializer.save(patient=user.patient_profile)

    def destroy(self, request, *args, **kwargs):
        rating = self.get_object()
        # Only the patient who created it can delete
        if request.user.role != User.Role.PATIENT or rating.patient != request.user.patient_profile:
            return Response({'error': 'You can only delete your own ratings'}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def respond(self, request, pk=None):
        """Doctor responds to a rating - only once"""
        rating = self.get_object()
        
        if request.user.role != User.Role.DOCTOR:
            return Response({'error': 'Only doctors can respond'}, status=403)
        
        if rating.doctor != request.user.doctor_profile:
            return Response({'error': 'You can only respond to your own ratings'}, status=403)
        
        if rating.doctor_response:
            return Response({'error': 'You have already responded to this rating'}, status=400)
        
        response_text = request.data.get('response', '')
        if not response_text:
            return Response({'error': 'Response text is required'}, status=400)
        
        rating.doctor_response = response_text
        rating.save()
        
        # Notify patient
        from notifications.views import create_notification
        create_notification(
            'patient',
            rating.patient,
            'DOCTOR_RESPONSE',
            f'Dr. {rating.doctor.user.first_name} {rating.doctor.user.last_name} has responded to your rating.'
        )
        
        return Response({'status': 'response added'})

