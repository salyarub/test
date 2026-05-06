import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import Layout from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { User, Stethoscope, Mail, Lock, Upload, ChevronDown, UserPlus, X } from 'lucide-react'
import { MEDICAL_SPECIALTIES } from '@/constants/specialties'

const RegisterPage = () => {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
        defaultValues: { role: 'PATIENT' }
    })
    const [isLoading, setIsLoading] = useState(false)
    const selectedRole = watch('role')
    const isRtl = i18n.language === 'ar'

    const onSubmit = async (data) => {
        setIsLoading(true)
        try {
            const formData = new FormData()
            formData.append('email', data.email)
            formData.append('password', data.password)
            formData.append('first_name', data.first_name)
            formData.append('last_name', data.last_name)
            formData.append('role', data.role)
            formData.append('gender', data.gender)

            if (data.role === 'DOCTOR') {
                formData.append('specialty', data.specialty)
                if (data.license_image && data.license_image[0]) {
                    formData.append('license_image', data.license_image[0])
                }
            }

            await api.post('auth/register/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            if (data.role === 'DOCTOR') {
                toast.success(t('register.doctorSuccess'))
            } else {
                toast.success(t('register.patientSuccess'))
            }
            navigate('/login')
        } catch (error) {
            console.error("Registration Error:", error.response?.data || error)

            const errorData = error.response?.data
            let msg = t('register.registrationFailed')

            if (errorData) {
                if (typeof errorData === 'string') {
                    msg = errorData
                } else if (errorData.error) {
                    msg = errorData.error
                } else if (errorData.detail) {
                    msg = errorData.detail
                } else if (errorData.email) {
                    msg = `${t('register.email')}: ${errorData.email}`
                } else if (errorData.password) {
                    msg = `${t('register.password')}: ${errorData.password}`
                } else {
                    const firstKey = Object.keys(errorData)[0]
                    if (firstKey && Array.isArray(errorData[firstKey])) {
                        msg = `${firstKey}: ${errorData[firstKey][0]}`
                    } else if (firstKey) {
                        msg = `${firstKey}: ${errorData[firstKey]}`
                    }
                }
            } else if (error.message) {
                msg = error.message
            }

            toast.error(msg)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Layout>
            {/* Background decoration */}
            <div className="relative min-h-[85vh] flex items-center justify-center py-10 overflow-hidden">
                <Card className="relative w-full max-w-lg shadow-2xl border-0 bg-card dark:border dark:border-border overflow-hidden">
                    {/* Top gradient bar */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

                    <CardHeader className="text-center pb-2 pt-6 sm:pt-8">
                        <div className="mx-auto mb-3 sm:mb-4 h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                            <UserPlus className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                        </div>
                        <CardTitle className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            {t('register.title')}
                        </CardTitle>
                        <CardDescription className="text-base mt-1">
                            {t('register.subtitle')}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="px-4 sm:px-6 md:px-8 pb-6 sm:pb-8">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

                            {/* Role Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                                    {t('register.selectRole')}
                                </Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div
                                        className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 flex flex-col items-center gap-2 sm:gap-2.5 transition-all duration-300 ${selectedRole === 'DOCTOR'
                                            ? 'border-blue-500 bg-gradient-to-b from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 shadow-md shadow-blue-500/10'
                                            : 'border-muted hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                                            }`}
                                        onClick={() => setValue('role', 'DOCTOR')}
                                    >
                                        <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center transition-colors duration-300 ${selectedRole === 'DOCTOR'
                                            ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                                            : 'bg-muted text-muted-foreground'
                                            }`}>
                                            <Stethoscope className="h-5 w-5 sm:h-6 sm:w-6" />
                                        </div>
                                        <span className={`font-semibold text-sm transition-colors ${selectedRole === 'DOCTOR' ? 'text-blue-600 dark:text-blue-400' : ''
                                            }`}>
                                            {t('register.doctor')}
                                        </span>
                                    </div>
                                    <div
                                        className={`cursor-pointer rounded-xl border-2 p-3 sm:p-4 flex flex-col items-center gap-2 sm:gap-2.5 transition-all duration-300 ${selectedRole === 'PATIENT'
                                            ? 'border-blue-500 bg-gradient-to-b from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 shadow-md shadow-blue-500/10'
                                            : 'border-muted hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                                            }`}
                                        onClick={() => setValue('role', 'PATIENT')}
                                    >
                                        <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center transition-colors duration-300 ${selectedRole === 'PATIENT'
                                            ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                                            : 'bg-muted text-muted-foreground'
                                            }`}>
                                            <User className="h-5 w-5 sm:h-6 sm:w-6" />
                                        </div>
                                        <span className={`font-semibold text-sm transition-colors ${selectedRole === 'PATIENT' ? 'text-blue-600 dark:text-blue-400' : ''
                                            }`}>
                                            {t('register.patient')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Name Fields */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">{t('register.firstName')}</Label>
                                    <Input
                                        {...register('first_name', {
                                            required: isRtl ? 'هذا الحقل مطلوب' : 'This field is required',
                                            pattern: {
                                                value: /^([\u0600-\u06FF\s]+|[a-zA-Z\s]+)$/,
                                                message: isRtl ? 'أحرف عربية فقط أو إنجليزية فقط' : 'Only Arabic or English letters'
                                            }
                                        })}
                                        className={`h-11 rounded-lg border-muted focus:border-blue-500 transition-colors ${errors.first_name ? 'border-red-500 focus:border-red-500' : ''}`}
                                        placeholder={isRtl ? 'أحمد' : 'John'}
                                    />
                                    {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name.message}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">{t('register.lastName')}</Label>
                                    <Input
                                        {...register('last_name', {
                                            required: isRtl ? 'هذا الحقل مطلوب' : 'This field is required',
                                            pattern: {
                                                value: /^([\u0600-\u06FF\s]+|[a-zA-Z\s]+)$/,
                                                message: isRtl ? 'أحرف عربية فقط أو إنجليزية فقط' : 'Only Arabic or English letters'
                                            }
                                        })}
                                        className={`h-11 rounded-lg border-muted focus:border-blue-500 transition-colors ${errors.last_name ? 'border-red-500 focus:border-red-500' : ''}`}
                                        placeholder={isRtl ? 'محمد' : 'Doe'}
                                    />
                                    {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name.message}</p>}
                                </div>
                            </div>

                            {/* Email */}
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium">{t('register.email')}</Label>
                                <div className="relative">
                                    <Mail className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRtl ? 'right-3' : 'left-3'}`} />
                                    <Input
                                        type="email"
                                        {...register('email', { required: true })}
                                        className={`h-11 rounded-lg border-muted focus:border-blue-500 transition-colors ${isRtl ? 'pr-10' : 'pl-10'}`}
                                        placeholder={isRtl ? 'example@email.com' : 'you@example.com'}
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium">{t('register.password')}</Label>
                                <div className="relative">
                                    <Lock className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRtl ? 'right-3' : 'left-3'}`} />
                                    <Input
                                        type="password"
                                        {...register('password', { required: true, minLength: 6 })}
                                        className={`h-11 rounded-lg border-muted focus:border-blue-500 transition-colors ${isRtl ? 'pr-10' : 'pl-10'}`}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {/* Gender Selection */}
                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium">{t('register.gender')}</Label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="radio"
                                            value="M"
                                            {...register('gender')}
                                            defaultChecked
                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-sm group-hover:text-blue-600 transition-colors">{t('register.male')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="radio"
                                            value="F"
                                            {...register('gender')}
                                            className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-sm group-hover:text-blue-600 transition-colors">{t('register.female')}</span>
                                    </label>
                                </div>
                            </div>

                            {/* Doctor-specific fields */}
                            {selectedRole === 'DOCTOR' && (
                                <div className="space-y-4 pt-2 border-t border-dashed border-blue-200 dark:border-blue-800">
                                    <div className="space-y-1.5">
                                        <Label className="text-sm font-medium">{t('register.specialty')}</Label>
                                        <div className="relative">
                                            <select
                                                {...register('specialty', { required: true })}
                                                className="flex h-11 w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer transition-colors"
                                            >
                                                <option value="">{t('register.selectSpecialty')}</option>
                                                {MEDICAL_SPECIALTIES.map((spec) => (
                                                    <option key={spec.value} value={spec.value}>
                                                        {isRtl ? spec.labelAr : spec.labelEn}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none ${isRtl ? 'left-3' : 'right-3'}`} />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-sm font-medium">{t('register.licenseUpload')}</Label>
                                        <div className="relative">
                                            <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 hover:border-blue-400 transition-colors relative">
                                                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                                                    <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <Input
                                                        type="file"
                                                        accept="image/*"
                                                        {...register('license_image', { required: true })}
                                                        className={`border-0 p-0 h-auto bg-transparent shadow-none focus-visible:ring-0 text-sm cursor-pointer w-full ${watch('license_image')?.[0] ? (isRtl ? 'pl-10' : 'pr-10') : ''}`}
                                                    />
                                                </div>
                                                {watch('license_image')?.[0] && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setValue('license_image', ''); // Clear the file
                                                        }}
                                                        className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-full transition-colors`}
                                                        title={isRtl ? "إزالة الصورة" : "Remove Image"}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                                                {t('register.licenseHint')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Submit Button */}
                            <Button
                                className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30"
                                size="lg"
                                disabled={isLoading}
                            >
                                {isLoading ? t('register.creatingAccount') : t('register.registerButton')}
                            </Button>

                            {/* Login Link */}
                            <p className="text-center text-sm text-muted-foreground">
                                {t('register.haveAccount')}{' '}
                                <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors">
                                    {t('register.loginLink')}
                                </Link>
                            </p>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </Layout>
    )
}

export default RegisterPage
