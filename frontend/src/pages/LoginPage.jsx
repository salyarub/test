import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import Layout from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { LogIn, Mail, Lock } from 'lucide-react'

const LoginPage = () => {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const { login, user } = useAuth() // Use login & user from context
    const { register, handleSubmit, formState: { errors } } = useForm()
    const [isLoading, setIsLoading] = useState(false)

    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            const userRole = user.role
            if (userRole === 'ADMIN') navigate('/admin')
            else if (userRole === 'DOCTOR') navigate('/doctor')
            else if (userRole === 'PATIENT') navigate('/patient')
            else if (userRole === 'SECRETARY') navigate('/secretary')
            else navigate('/')
        }
    }, [user, navigate])

    // Check if current language is RTL (Arabic)
    const isRtl = i18n.language === 'ar'

    // Helper function to get translated error message
    const getTranslatedError = (errorData, originalError) => {
        // Check for specific error codes from the backend
        if (errorData?.error) {
            if (errorData.error === 'account_banned') {
                return isRtl ? 'تم حظر حسابك. يرجى التواصل مع الدعم.' : 'Your account has been banned. Please contact support.'
            }
            if (errorData.error === 'account_disabled') {
                return t('login.accountDisabled')
            }
            if (errorData.error === 'invalid_credentials') {
                return t('login.invalidCredentials')
            }
            if (errorData.error === 'email_not_verified') {
                return 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول'
            }
        }

        // Check for common error patterns in detail (fallback)
        if (errorData?.detail) {
            const detail = errorData.detail.toLowerCase()
            if (detail.includes('disabled') || detail.includes('inactive')) {
                return t('login.accountDisabled')
            }
            if (detail.includes('no active account') || detail.includes('given credentials')) {
                return t('login.noActiveAccount')
            }
        }

        // Check for network errors
        if (!originalError.response) {
            return t('login.networkError')
        }

        // Default error message
        return t('login.invalidCredentials')
    }

    const onSubmit = async (data) => {
        setIsLoading(true)
        try {
            // Use context login which handles token storage, state update, and cache clearing
            const user = await login(data.email, data.password)

            toast.success(t('login.welcomeBack'))

            // Role-based redirect
            const userRole = user.role
            if (userRole === 'ADMIN') {
                navigate('/admin')
            } else if (userRole === 'DOCTOR') {
                navigate('/doctor')
            } else if (userRole === 'PATIENT') {
                navigate('/patient')
            } else if (userRole === 'SECRETARY') {
                navigate('/secretary')
            } else {
                navigate('/') // Default to home
            }
        } catch (error) {
            console.error("Login Error:", error.response?.data || error)
            const errorData = error.response?.data

            if (errorData?.error === 'email_not_verified') {
                navigate(`/unverified-account?email=${encodeURIComponent(data.email)}`)
            } else {
                const msg = getTranslatedError(errorData, error)
                toast.error(msg)
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Layout>
            <div className="relative min-h-[85vh] flex items-center justify-center py-10 overflow-hidden">
                <Card className="relative w-full max-w-lg shadow-2xl border-0 bg-card dark:border dark:border-border overflow-hidden">
                    <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

                    <CardHeader className="text-center pb-2 pt-6 sm:pt-8">
                        <div className="mx-auto mb-3 sm:mb-4 h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                            <LogIn className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                        </div>
                        <CardTitle className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            {t('login.title')}
                        </CardTitle>
                        <CardDescription className="text-base mt-1">
                            {t('login.subtitle')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 sm:px-6 md:px-8 pb-6 sm:pb-8">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium" htmlFor="email">{t('login.email')}</Label>
                                <div className="relative">
                                    <Mail className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRtl ? 'right-3' : 'left-3'}`} />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="doctor@example.com"
                                        {...register('email', { required: true })}
                                        className={`h-11 rounded-lg border-muted focus:border-blue-500 transition-colors ${isRtl ? 'pr-10' : 'pl-10'}`}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-sm font-medium" htmlFor="password">{t('login.password')}</Label>
                                <div className="relative">
                                    <Lock className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRtl ? 'right-3' : 'left-3'}`} />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        {...register('password', { required: true })}
                                        className={`h-11 rounded-lg border-muted focus:border-blue-500 transition-colors ${isRtl ? 'pr-10' : 'pl-10'}`}
                                    />
                                </div>
                                <div className="flex justify-start pt-1">
                                    <button
                                        type="button"
                                        onClick={() => navigate('/forgot-password')}
                                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline font-medium transition-colors"
                                    >
                                        {isRtl ? 'هل نسيت كلمة المرور؟' : 'Forgot password?'}
                                    </button>
                                </div>
                            </div>

                            <Button
                                className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30"
                                size="lg"
                                disabled={isLoading}
                            >
                                {isLoading ? t('login.loggingIn') : t('login.loginButton')}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </Layout>
    )
}

export default LoginPage

