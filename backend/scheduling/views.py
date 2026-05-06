from rest_framework import viewsets, views, status, permissions, generics
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import TimeOff, ReschedulingRequest, DoctorAvailability
from .serializers import TimeOffSerializer, ReschedulingRequestSerializer, DoctorAvailabilitySerializer
from .services import ConflictService, SmartSlotEngine
from users.models import User, Doctor
from clinic.models import Booking
from django.utils import timezone
from datetime import datetime, timedelta
import uuid

class DoctorAvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorAvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.role == User.Role.DOCTOR and hasattr(user, 'doctor_profile'):
            return DoctorAvailability.objects.filter(doctor=user.doctor_profile)
        return DoctorAvailability.objects.none()
    
    def perform_create(self, serializer):
        if self.request.user.role == User.Role.DOCTOR:
            serializer.save(doctor=self.request.user.doctor_profile)
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Update all availability settings at once"""
        if request.user.role != User.Role.DOCTOR:
            return Response({"error": "Unauthorized"}, status=403)
        
        doctor = request.user.doctor_profile
        availabilities = request.data.get('availabilities', [])
        
        # Clear existing and create new
        DoctorAvailability.objects.filter(doctor=doctor).delete()
        
        for avail in availabilities:
            DoctorAvailability.objects.create(
                doctor=doctor,
                day_of_week=avail['day_of_week'],
                start_time=avail['start_time'],
                end_time=avail['end_time'],
                slot_duration=avail.get('slot_duration', 30),
                max_patients_per_slot=avail.get('max_patients_per_slot', 1),
                is_available=avail.get('is_available', True)
            )
        
        return Response({"status": "success"})

class DoctorSlotsView(views.APIView):
    """Get available slots for a doctor"""
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, doctor_id):
        try:
            doctor = Doctor.objects.get(id=doctor_id)
        except Doctor.DoesNotExist:
            return Response({"error": "Doctor not found"}, status=404)
        
        if not doctor.is_digital_booking_active:
             return Response({
                 'doctor_id': str(doctor_id),
                 'slots': [],
                 'message': 'Doctor is not accepting digital bookings'
             })
        
        # Booking Visibility Limit
        weeks_visible = doctor.booking_visibility_weeks
        days_visible = weeks_visible * 7
        
        # Get next X days
        today = timezone.now().date()
        cutoff_time = timezone.now() + timedelta(hours=doctor.booking_cutoff_hours)
        
        slots = []
        blocked_dates = []
        
        availabilities = DoctorAvailability.objects.filter(doctor=doctor, is_available=True)
        
        for day_offset in range(0, days_visible + 1):  # usage of dynamic visibility - starting from 0 (today)
            check_date = today + timedelta(days=day_offset)
            day_of_week = check_date.weekday()
            # Convert python weekday (0=Mon) to our format (0=Sun)
            day_of_week = (day_of_week + 1) % 7
            
            # Find availability for this day
            day_avails = availabilities.filter(day_of_week=day_of_week)
            
            # Check for Full Day TimeOff (excluding CANCELLED)
            full_off = TimeOff.objects.filter(
                doctor=doctor,
                start_date__lte=check_date,
                end_date__gte=check_date,
                start_time__isnull=True,
                end_time__isnull=True
            ).exclude(status='CANCELLED').first()
            
            if full_off:
                if full_off.type == 'DIGITAL_UNAVAILABLE':
                    blocked_dates.append(check_date.isoformat())
                continue

            # Get partial time offs (excluding CANCELLED)
            partial_offs = TimeOff.objects.filter(
                doctor=doctor,
                start_date__lte=check_date,
                end_date__gte=check_date
            ).exclude(start_time__isnull=True, end_time__isnull=True).exclude(status='CANCELLED')
            
            for avail in day_avails:
                # Generate time slots
                current_time = datetime.combine(check_date, avail.start_time)
                end_time = datetime.combine(check_date, avail.end_time)
                
                while current_time + timedelta(minutes=avail.slot_duration) <= end_time:
                    slot_datetime = timezone.make_aware(current_time)
                    
                    # Determine effective cutoff time: either the defined cutoff or at least the current time
                    effective_cutoff = cutoff_time if doctor.is_booking_cutoff_active else timezone.now()
                    if slot_datetime < effective_cutoff:
                        current_time += timedelta(minutes=avail.slot_duration)
                        continue
                    
                    # Check partial time off
                    is_off_slot = False
                    for off in partial_offs:
                        if off.start_time <= current_time.time() <= off.end_time:
                            is_off_slot = True
                            break
                    
                    if is_off_slot:
                         current_time += timedelta(minutes=avail.slot_duration)
                         continue

                    # Check existing bookings for this slot - count TOTAL PEOPLE not just bookings
                    # Only CANCELLED frees the slot
                    from django.db.models import Sum
                    existing_people_result = Booking.objects.filter(
                        doctor=doctor,
                        booking_datetime=slot_datetime
                    ).exclude(status='CANCELLED').aggregate(total_people=Sum('number_of_people'))
                    existing_people = existing_people_result['total_people'] or 0
                    
                    available_spots = max(0, avail.max_patients_per_slot - existing_people)
                    is_full = available_spots <= 0
                    
                    # Return ALL slots, including full ones (for display purposes)
                    slots.append({
                        'datetime': slot_datetime.isoformat(),
                        'available_spots': available_spots,
                        'max_spots': avail.max_patients_per_slot,
                        'booked_people': existing_people,
                        'is_full': is_full
                    })
                    
                    current_time += timedelta(minutes=avail.slot_duration)
        
        return Response({
            'doctor_id': str(doctor_id),
            'slots': slots,
            'blocked_dates': blocked_dates
        })

class CheckConflictsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role != User.Role.DOCTOR:
            return Response({"error": "Unauthorized"}, status=403)

        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        
        if not start_date or not end_date:
            return Response({"error": "Dates required"}, status=400)
            
        conflicts = ConflictService.check_conflicts(request.user.doctor_profile, start_date, end_date)
        
        data = {
            "conflict_count": conflicts.count(),
            "conflicting_bookings": [
                {"id": str(b.id), "patient": str(b.patient), "time": str(b.booking_datetime)} 
                for b in conflicts
            ]
        }
        return Response(data)

class TimeOffView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        user = request.user
        if user.role == User.Role.DOCTOR:
            doctor = user.doctor_profile
        elif user.role == User.Role.SECRETARY:
            doctor = user.secretary_profile.doctor
        else:
            return Response({"error": "Unauthorized"}, status=403)
            
        # Get active (future) leaves
        today = timezone.now().date()
        leaves = TimeOff.objects.filter(
            doctor=doctor, 
            end_date__gte=today
        ).order_by('start_date')
        
        return Response(TimeOffSerializer(leaves, many=True).data)

    def post(self, request):
        user = request.user
        
        # Determine doctor and check permissions
        if user.role == User.Role.DOCTOR:
            doctor = user.doctor_profile
        elif user.role == User.Role.SECRETARY:
            if 'manage_time_off' not in user.secretary_profile.permissions:
                return Response({"error": "No permission to manage time off", "error_ar": "لا تملك صلاحية إدارة الإجازات"}, status=403)
            doctor = user.secretary_profile.doctor
        else:
            return Response({"error": "Unauthorized"}, status=403)
        
        serializer = TimeOffSerializer(data=request.data)
        if serializer.is_valid():
            time_off = serializer.save(doctor=doctor)
            
            action = request.data.get('action')
            
            if action == 'AUTO_PROCESS':
                results = ConflictService.auto_resolve_conflicts(time_off)
                time_off.all_conflicts_handled = True
                time_off.save()
                return Response({"status": "success", "results": results}, status=201)
                
            return Response(serializer.data, status=201)
            return Response(serializer.data, status=201)
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

class TimeOffDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TimeOffSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.role == User.Role.DOCTOR:
            return TimeOff.objects.filter(doctor=user.doctor_profile)
        elif user.role == User.Role.SECRETARY:
            return TimeOff.objects.filter(doctor=user.secretary_profile.doctor)
        return TimeOff.objects.none()

    def perform_destroy(self, instance):
        # We prefer soft delete/cancel
        instance.status = TimeOff.Status.CANCELLED
        instance.save()

class PublicReschedulingView(views.APIView):
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, token):
        try:
            req = ReschedulingRequest.objects.get(token=token)
            if req.expires_at < timezone.now():
                return Response({"error": "Token expired"}, status=400)
                
            serializer = ReschedulingRequestSerializer(req)
            return Response(serializer.data)
        except ReschedulingRequest.DoesNotExist:
            return Response({"error": "Invalid token"}, status=404)

    def post(self, request, token):
        try:
            req = ReschedulingRequest.objects.get(token=token)
            if req.expires_at < timezone.now():
                return Response({"error": "Token expired"}, status=400)
            
            selected_slot = request.data.get('selected_slot')
            if not selected_slot:
                return Response({"error": "No slot selected"}, status=400)
                
            new_booking = Booking.objects.create(
                doctor=req.doctor,
                patient=req.patient,
                booking_datetime=selected_slot,
                status=Booking.Status.CONFIRMED,
            )
            
            req.status = ReschedulingRequest.Status.ACCEPTED
            req.new_booking = new_booking
            req.save()
            
            req.original_booking.rescheduled_from = new_booking
            req.original_booking.save()
            
            return Response({"status": "success", "new_booking_id": str(new_booking.id)})
            
        except ReschedulingRequest.DoesNotExist:
            return Response({"error": "Invalid token"}, status=404)


class AuthenticatedRescheduleAcceptView(views.APIView):
    """
    Authenticated endpoint for patients to accept a reschedule slot from in-app notification.
    Unlike PublicReschedulingView which uses tokens, this uses authentication.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def post(self, request, reschedule_id):
        """Accept a reschedule offer by selecting a slot"""
        try:
            req = ReschedulingRequest.objects.get(id=reschedule_id)
            
            # Verify the patient owns this reschedule request
            if not hasattr(request.user, 'patient_profile') or req.patient != request.user.patient_profile:
                return Response({"error": "Unauthorized", "error_ar": "غير مصرح"}, status=403)
            
            # Check if already handled
            if req.status != ReschedulingRequest.Status.PENDING:
                return Response({
                    "error": "Already handled", 
                    "error_ar": "تم التعامل مع هذا الطلب مسبقاً",
                    "status": req.status
                }, status=400)
            
            # Check expiry
            if req.expires_at < timezone.now():
                req.status = ReschedulingRequest.Status.EXPIRED
                req.save()
                # Cancel all reserved bookings on expiry
                self._cancel_reserved_bookings(req)
                self._send_expiry_notification(req)
                return Response({"error": "Expired", "error_ar": "انتهت صلاحية العرض"}, status=400)
            
            selected_slot = request.data.get('selected_slot')
            if not selected_slot:
                return Response({"error": "No slot selected", "error_ar": "لم يتم اختيار موعد"}, status=400)
            
            # Validate slot is in suggested slots
            if selected_slot not in req.suggested_slots:
                return Response({"error": "Invalid slot", "error_ar": "موعد غير صالح"}, status=400)
            
            from django.db import transaction
            
            with transaction.atomic():
                # Find the reserved booking for the selected slot and CONFIRM it
                selected_booking = None
                for booking_id_str in req.reserved_bookings:
                    try:
                        reserved_booking = Booking.objects.get(id=booking_id_str)
                        if reserved_booking.booking_datetime.isoformat() == selected_slot or str(reserved_booking.booking_datetime) == selected_slot:
                            reserved_booking.status = Booking.Status.CONFIRMED
                            reserved_booking.notes = ''
                            reserved_booking.save()
                            selected_booking = reserved_booking
                        else:
                            # Cancel the other reserved bookings
                            reserved_booking.status = Booking.Status.CANCELLED
                            reserved_booking.cancellation_reason = 'تم اختيار موعد بديل آخر'
                            reserved_booking.save()
                    except Booking.DoesNotExist:
                        pass
                
                # If no reserved booking found for the slot, create a new one
                if not selected_booking:
                    selected_booking = Booking.objects.create(
                        doctor=req.doctor,
                        patient=req.patient,
                        booking_datetime=selected_slot,
                        status=Booking.Status.CONFIRMED,
                    )
            
            # Update reschedule request
            req.status = ReschedulingRequest.Status.ACCEPTED
            req.new_booking = selected_booking
            req.save()
            
            # Link original booking
            if req.original_booking:
                req.original_booking.rescheduled_from = selected_booking
                req.original_booking.save()
            
            # Send confirmation notification
            try:
                from notifications.views import create_notification
                from datetime import datetime
                
                slot_dt = datetime.fromisoformat(selected_slot.replace('Z', '+00:00'))
                formatted_date = slot_dt.strftime('%Y-%m-%d')
                formatted_time = slot_dt.strftime('%H:%M')
                
                message_ar = f'تم تحويل حجزك بنجاح! موعدك الجديد: {formatted_date} الساعة {formatted_time} مع د. {req.doctor.user.first_name} {req.doctor.user.last_name}'
                
                create_notification(
                    'patient',
                    req.patient,
                    'BOOKING_CONFIRMED',
                    message_ar,
                    related_object_id=selected_booking.id
                )
            except Exception as e:
                print(f"Failed to send confirmation notification: {e}")
            
            return Response({
                "status": "success",
                "new_booking_id": str(selected_booking.id),
                "message": "تم تحويل حجزك بنجاح",
                "new_datetime": selected_slot
            })
            
        except ReschedulingRequest.DoesNotExist:
            return Response({"error": "Not found", "error_ar": "غير موجود"}, status=404)
    
    def delete(self, request, reschedule_id):
        """Reject all reschedule offers"""
        try:
            req = ReschedulingRequest.objects.get(id=reschedule_id)
            
            # Verify the patient owns this reschedule request
            if not hasattr(request.user, 'patient_profile') or req.patient != request.user.patient_profile:
                return Response({"error": "Unauthorized"}, status=403)
            
            if req.status != ReschedulingRequest.Status.PENDING:
                return Response({"error": "Already handled"}, status=400)
            
            req.status = ReschedulingRequest.Status.REJECTED
            req.save()
            
            # Cancel all reserved bookings
            self._cancel_reserved_bookings(req)
            
            return Response({"status": "rejected"})
            
        except ReschedulingRequest.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
    
    def _cancel_reserved_bookings(self, req):
        """Cancel all reserved PENDING bookings for a rescheduling request"""
        for booking_id_str in req.reserved_bookings:
            try:
                reserved_booking = Booking.objects.get(id=booking_id_str)
                if reserved_booking.status == Booking.Status.PENDING:
                    reserved_booking.status = Booking.Status.CANCELLED
                    reserved_booking.cancellation_reason = 'انتهت صلاحية المواعيد البديلة'
                    reserved_booking.save()
            except Booking.DoesNotExist:
                pass
    
    def _send_expiry_notification(self, req):
        """Send expiry notification to patient"""
        try:
            from notifications.views import create_notification
            message = f'انتهت صلاحية المواعيد البديلة لموعدك الملغى مع د. {req.doctor.user.first_name} {req.doctor.user.last_name}. يرجى حجز موعد جديد.'
            create_notification(
                'patient',
                req.patient,
                'RESCHEDULE_EXPIRED',
                message,
                related_object_id=req.id
            )
        except Exception as e:
            print(f"Failed to send expiry notification: {e}")


class DaySlotsView(views.APIView):
    """Get available slots for a specific date for current doctor/secretary"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        user = request.user
        date_str = request.query_params.get('date')
        
        if not date_str:
            return Response({"error": "Date required"}, status=400)
        
        try:
            check_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except:
            return Response({"error": "Invalid date format"}, status=400)
        
        # Determine doctor
        if user.role == User.Role.DOCTOR:
            doctor = user.doctor_profile
        elif user.role == User.Role.SECRETARY:
            doctor = user.secretary_profile.doctor
        else:
            return Response({"error": "Unauthorized"}, status=403)
        
        # Get day of week (0=Sunday in our model)
        python_weekday = check_date.weekday()
        day_of_week = (python_weekday + 1) % 7
        
        # Get availability for this day
        availabilities = DoctorAvailability.objects.filter(
            doctor=doctor, 
            day_of_week=day_of_week,
            is_available=True
        )
        
        if not availabilities.exists():
            return Response({
                "slots": [],
                "message": "No working hours for this day"
            })
        
        # Check for full day off (excluding CANCELLED)
        is_full_off = TimeOff.objects.filter(
            doctor=doctor,
            start_date__lte=check_date,
            end_date__gte=check_date,
            start_time__isnull=True,
            end_time__isnull=True
        ).exclude(status='CANCELLED').exclude(type='DIGITAL_UNAVAILABLE').exists()

        if is_full_off:
             return Response({
                "date": date_str,
                "slots": [],
                "message": "Doctor is on emergency leave"
            })
            
        # Partial offs (excluding CANCELLED and DIGITAL_UNAVAILABLE)
        partial_offs = TimeOff.objects.filter(
            doctor=doctor,
            start_date__lte=check_date,
            end_date__gte=check_date
        ).exclude(start_time__isnull=True, end_time__isnull=True).exclude(status='CANCELLED').exclude(type='DIGITAL_UNAVAILABLE')
        
        start_of_day = timezone.make_aware(datetime.combine(check_date, datetime.min.time()))
        end_of_day = timezone.make_aware(datetime.combine(check_date, datetime.max.time()))
        
        daily_bookings = Booking.objects.filter(
            doctor=doctor,
            booking_datetime__gte=start_of_day,
            booking_datetime__lte=end_of_day
        ).exclude(status__in=['CANCELLED', 'EXPIRED']).values('booking_datetime', 'number_of_people')
        
        from collections import defaultdict
        bookings_counter = defaultdict(int)
        for b in daily_bookings:
            dt = b['booking_datetime']
            # Ensure we match exactly by removing microseconds if any
            if hasattr(dt, 'replace'):
                dt = dt.replace(microsecond=0)
            bookings_counter[dt] += b.get('number_of_people', 1)

        slots = []
        last_slot_duration = 30  # Default
        last_slot_time = None
        now = timezone.now()
        
        for avail in availabilities:
            current_time = datetime.combine(check_date, avail.start_time)
            end_time = datetime.combine(check_date, avail.end_time)
            last_slot_duration = avail.slot_duration
            max_per_slot = avail.max_patients_per_slot
            
            while current_time + timedelta(minutes=avail.slot_duration) <= end_time:
                slot_datetime = timezone.make_aware(current_time)
                
                # Check partial time off
                is_off_slot = False
                for off in partial_offs:
                    if off.start_time <= current_time.time() <= off.end_time:
                        is_off_slot = True
                        break
                
                if is_off_slot:
                        current_time += timedelta(minutes=avail.slot_duration)
                        continue

                # Use pre-fetched count
                existing_bookings = bookings_counter[slot_datetime]
                
                available_spots = max_per_slot - existing_bookings
                
                # Check if slot time has passed (expired)
                is_expired = slot_datetime < now
                
                slots.append({
                    'time': current_time.strftime('%H:%M'),
                    'datetime': slot_datetime.isoformat(),
                    'booked': existing_bookings,
                    'max': max_per_slot,
                    'available': max(0, available_spots),
                    'is_full': available_spots <= 0,
                    'is_overflow': False,
                    'is_expired': is_expired
                })
                
                last_slot_time = slot_datetime
                current_time += timedelta(minutes=avail.slot_duration)
        
        # Add ONE overflow slot at the end if overbooking is allowed (only for today or future)
        if doctor.allow_overbooking and last_slot_time and check_date >= now.date():
            overflow_time = last_slot_time + timedelta(minutes=last_slot_duration)
            slots.append({
                'time': overflow_time.strftime('%H:%M'),
                'datetime': overflow_time.isoformat(),
                'booked': 0,
                'max': 99,
                'available': 99,
                'is_full': False,
                'is_overflow': True,
                'is_expired': False
            })
        
        return Response({
            "date": date_str,
            "slots": slots,
            "allow_overbooking": doctor.allow_overbooking
        })
