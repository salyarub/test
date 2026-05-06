import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Layout from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import api from '@/lib/axios'
import { toast } from 'sonner'
import { Save, Pencil, X, Mail, Phone, Shield, Sparkles, Key, Trash2, AlertTriangle } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAuth } from '@/context/AuthContext'

const ProfilePage = () => {
    const { i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const [isEditing, setIsEditing] = useState(false)
    const queryClient = useQueryClient()

    const { data: user, isLoading } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            const res = await api.get('auth/me/')
            return res.data
        }
    })

    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        phone: ''
    })

    const [passwordData, setPasswordData] = useState({
        old_password: '',
        new_password: '',
        confirm_password: ''
    })
    const [isPasswordSectionOpen, setIsPasswordSectionOpen] = useState(false)
    const [deletePassword, setDeletePassword] = useState('')
    const { logout } = useAuth()

    React.useEffect(() => {
        if (user) {
            setFormData({
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                phone: user.phone || ''
            })
        }
    }, [user])

    const updateMutation = useMutation({
        mutationFn: async (data) => {
            const formDataToSend = new FormData()
            Object.keys(data).forEach(key => {
                if (data[key] !== null && data[key] !== undefined) {
                    formDataToSend.append(key, data[key])
                }
            })
            const res = await api.patch('auth/profile/', formDataToSend, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            return res.data
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم حفظ التغييرات' : 'Profile updated!')
            queryClient.invalidateQueries(['currentUser'])
            setIsEditing(false)
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update profile')
        }
    })

    const changePasswordMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post('auth/change-password/', data)
            return res.data
        },
        onSuccess: () => {
            toast.success(isRtl ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully')
            setPasswordData({ old_password: '', new_password: '', confirm_password: '' })
            setIsPasswordSectionOpen(false)
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || (isRtl ? 'فشل تغيير كلمة المرور' : 'Failed to change password'))
        }
    })

    const deleteAccountMutation = useMutation({
        mutationFn: async (password) => {
            const res = await api.delete('auth/delete-account/', { data: { password } })
            return res.data
        },
        onSuccess: (data) => {
            toast.success(data.message || (isRtl ? 'تم حذف الحساب بنجاح' : 'Account deleted successfully'))
            logout()
        },
        onError: (error) => {
            const errorMsg = error.response?.data?.error;
            if (errorMsg === 'Invalid password') {
                toast.error(isRtl ? 'كلمة المرور غير صحيحة' : 'Invalid password')
            } else {
                toast.error(errorMsg || (isRtl ? 'فشل حذف الحساب' : 'Failed to delete account'))
            }
        }
    })

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handlePasswordChange = (e) => {
        setPasswordData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSave = () => {
        updateMutation.mutate(formData)
    }

    const handleChangePasswordSubmit = (e) => {
        e.preventDefault()
        if (passwordData.new_password !== passwordData.confirm_password) {
            toast.error(isRtl ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
            return
        }
        changePasswordMutation.mutate({
            old_password: passwordData.old_password,
            new_password: passwordData.new_password
        })
    }

    const getRoleLabel = (role) => {
        const roles = {
            PATIENT: isRtl ? 'مريض' : 'Patient',
            DOCTOR: isRtl ? 'طبيب' : 'Doctor',
            SECRETARY: isRtl ? 'سكرتير' : 'Secretary',
            ADMIN: isRtl ? 'مدير' : 'Admin',
        }
        return roles[role] || role
    }

    const getRoleColor = (role) => {
        const colors = {
            PATIENT: 'from-blue-500 to-cyan-400',
            DOCTOR: 'from-emerald-500 to-teal-400',
            SECRETARY: 'from-purple-500 to-violet-400',
            ADMIN: 'from-red-500 to-orange-400',
        }
        return colors[role] || 'from-blue-500 to-cyan-400'
    }

    if (isLoading) {
        return (
            <Layout>
                <div className="flex justify-center py-20">
                    <div className="relative">
                        <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                        <Sparkles className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                </div>
            </Layout>
        )
    }

    const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`

    return (
        <Layout>
            <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">

                {/* Hero Banner with Gradient */}
                <div className="relative overflow-hidden rounded-2xl">
                    {/* Gradient Background */}
                    <div className={`h-28 sm:h-40 bg-gradient-to-br ${getRoleColor(user?.role)} relative`}>
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnYtNGgydjRoNHYyaC00djRoLTJ2LTR6bTAtMzBoLTJ2LTRoMlYwaDF2NGg0djJoLTR2NGgtMlY0em0tMzAgMGgtMnYtNGgyVjBoMnY0aDR2MmgtNHY0aC0yVjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30"></div>
                        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent"></div>
                    </div>

                    {/* Avatar overlapping the banner */}
                    <div className="relative -mt-12 sm:-mt-16 px-4 sm:px-6 pb-4 sm:pb-6">
                        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
                            {/* Large Avatar */}
                            <div className={`h-20 w-20 sm:h-28 sm:w-28 rounded-2xl bg-gradient-to-br ${getRoleColor(user?.role)} flex items-center justify-center text-white text-2xl sm:text-4xl font-bold shadow-xl ring-4 ring-background shrink-0`}>
                                {initials || 'U'}
                            </div>

                            {/* Name & Role */}
                            <div className="flex-1 text-center sm:text-start pb-1">
                                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                                    {user?.first_name} {user?.last_name}
                                </h1>
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1.5">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${getRoleColor(user?.role)} text-white shadow-sm`}>
                                        <Shield className="h-3 w-3" />
                                        {getRoleLabel(user?.role)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {user?.email}
                                    </span>
                                </div>
                            </div>

                            {/* Edit Toggle */}
                            <div className="shrink-0">
                                {!isEditing ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsEditing(true)}
                                        className="gap-2 rounded-xl hover:bg-primary hover:text-white transition-all duration-300"
                                    >
                                        <Pencil className="h-4 w-4" />
                                        {isRtl ? 'تعديل' : 'Edit'}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsEditing(false)}
                                        className="gap-2 rounded-xl text-muted-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                        {isRtl ? 'إلغاء' : 'Cancel'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* First Name */}
                    <div className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <span className="text-blue-500 text-sm font-bold">{isRtl ? 'أ' : 'F'}</span>
                            </div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {isRtl ? 'الاسم الأول' : 'First Name'}
                            </label>
                        </div>
                        {isEditing ? (
                            <Input
                                name="first_name"
                                value={formData.first_name}
                                onChange={handleChange}
                                className="border-primary/30 focus:ring-2 focus:ring-primary/20 rounded-lg"
                            />
                        ) : (
                            <p className="text-lg font-semibold px-1">{user?.first_name || '—'}</p>
                        )}
                    </div>

                    {/* Last Name */}
                    <div className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                <span className="text-purple-500 text-sm font-bold">{isRtl ? 'ع' : 'L'}</span>
                            </div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {isRtl ? 'الاسم الأخير' : 'Last Name'}
                            </label>
                        </div>
                        {isEditing ? (
                            <Input
                                name="last_name"
                                value={formData.last_name}
                                onChange={handleChange}
                                className="border-primary/30 focus:ring-2 focus:ring-primary/20 rounded-lg"
                            />
                        ) : (
                            <p className="text-lg font-semibold px-1">{user?.last_name || '—'}</p>
                        )}
                    </div>

                    {/* Phone */}
                    <div className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <Phone className="h-4 w-4 text-emerald-500" />
                            </div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {isRtl ? 'رقم الهاتف' : 'Phone Number'}
                            </label>
                        </div>
                        {isEditing ? (
                            <Input
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="+966 5XX XXX XXXX"
                                className="border-primary/30 focus:ring-2 focus:ring-primary/20 rounded-lg"
                            />
                        ) : (
                            <p className="text-lg font-semibold px-1 font-mono" dir="ltr">{user?.phone || '—'}</p>
                        )}
                    </div>

                    {/* Email - Always readonly */}
                    <div className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                <Mail className="h-4 w-4 text-orange-500" />
                            </div>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {isRtl ? 'البريد الإلكتروني' : 'Email'}
                            </label>
                        </div>
                        <p className="text-lg font-semibold px-1 text-muted-foreground">{user?.email || '—'}</p>
                    </div>
                </div>

                {/* Save Button - Only when editing */}
                {isEditing && (
                    <div className="flex justify-center">
                        <Button
                            onClick={handleSave}
                            disabled={updateMutation.isPending}
                            className={`gap-2 px-8 py-3 rounded-xl bg-gradient-to-r ${getRoleColor(user?.role)} text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]`}
                            size="lg"
                        >
                            <Save className="h-5 w-5" />
                            {updateMutation.isPending
                                ? (isRtl ? 'جاري الحفظ...' : 'Saving...')
                                : (isRtl ? 'حفظ التغييرات' : 'Save Changes')}
                        </Button>
                    </div>
                )}

                {/* Account Management Section */}
                {isEditing && (
                    <div className="mt-12 space-y-6 pt-8 border-t border-border">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" />
                            {isRtl ? 'إدارة الحساب' : 'Account Management'}
                        </h2>

                        {/* Change Password */}
                        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                            <div
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => setIsPasswordSectionOpen(!isPasswordSectionOpen)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                        <Key className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{isRtl ? 'تغيير كلمة المرور' : 'Change Password'}</h3>
                                        <p className="text-sm text-muted-foreground">{isRtl ? 'تحديث كلمة مرور حسابك' : 'Update your account password'}</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm">
                                    {isPasswordSectionOpen ? (isRtl ? 'إغلاق' : 'Close') : (isRtl ? 'تغيير' : 'Change')}
                                </Button>
                            </div>

                            {isPasswordSectionOpen && (
                                <form onSubmit={handleChangePasswordSubmit} className="p-4 border-t bg-muted/20 space-y-4">
                                    <div className="space-y-4 max-w-sm">
                                        <Input
                                            type="password"
                                            name="old_password"
                                            placeholder={isRtl ? 'كلمة المرور الحالية' : 'Current Password'}
                                            value={passwordData.old_password}
                                            onChange={handlePasswordChange}
                                            required
                                        />
                                        <Input
                                            type="password"
                                            name="new_password"
                                            placeholder={isRtl ? 'كلمة المرور الجديدة' : 'New Password'}
                                            value={passwordData.new_password}
                                            onChange={handlePasswordChange}
                                            required
                                            minLength={6}
                                        />
                                        <Input
                                            type="password"
                                            name="confirm_password"
                                            placeholder={isRtl ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                                            value={passwordData.confirm_password}
                                            onChange={handlePasswordChange}
                                            required
                                        />
                                        <Button
                                            type="submit"
                                            disabled={changePasswordMutation.isPending}
                                            className="w-full"
                                        >
                                            {changePasswordMutation.isPending
                                                ? (isRtl ? 'جاري التغيير...' : 'Changing...')
                                                : (isRtl ? 'حفظ كلمة المرور' : 'Save Password')
                                            }
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>

                        {/* Delete Account */}
                        <div className="bg-card border border-red-200 dark:border-red-900/50 rounded-xl p-4 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                                    <Trash2 className="h-5 w-5 text-red-500" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-red-600 dark:text-red-400">
                                        {isRtl ? 'حذف الحساب' : 'Delete Account'}
                                    </h3>
                                    <p className="text-sm text-muted-foreground max-w-md">
                                        {isRtl
                                            ? 'بمجرد حذف حسابك، سيتم إخفاؤه مباشرة ولن يظهر للمرضى. إذا لم تقم بتسجيل الدخول خلال 30 يوماً، سيتم حذفه نهائياً.'
                                            : 'Once deleted, your account will be hidden immediately. If you do not log back in within 30 days, it will be permanently deleted.'}
                                    </p>
                                </div>
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="gap-2">
                                        <Trash2 className="h-4 w-4" />
                                        {isRtl ? 'حذف الحساب' : 'Delete'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                            <AlertTriangle className="h-5 w-5" />
                                            {isRtl ? 'هل أنت متأكد من حذف الحساب؟' : 'Are you sure you want to delete your account?'}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-base text-foreground mt-2 leading-relaxed">
                                            {isRtl
                                                ? 'سيتم تسجيل خروجك وسيعتبر حسابك محذوفاً. سيتم إخفاء بياناتك. '
                                                : 'You will be logged out and your account will be marked for deletion. Your profile will be hidden. '}
                                            <br /><br />
                                            <strong className="text-primary font-bold">
                                                {isRtl
                                                    ? 'لإلغاء عملية الحذف واستعادة حسابك، يكفي أن تقوم بتسجيل الدخول مرة أخرى خلال 30 يوماً.'
                                                    : 'To cancel the deletion and restore your account, simply log back in within 30 days.'}
                                            </strong>
                                        </AlertDialogDescription>
                                        <div className="mt-4">
                                            <Input
                                                type="password"
                                                placeholder={isRtl ? 'أدخل كلمة المرور لتأكيد الحذف' : 'Enter your password to confirm'}
                                                value={deletePassword}
                                                onChange={(e) => setDeletePassword(e.target.value)}
                                            />
                                        </div>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="mt-6 gap-2">
                                        <AlertDialogCancel className="mt-0" onClick={() => setDeletePassword('')}>
                                            {isRtl ? 'إلغاء' : 'Cancel'}
                                        </AlertDialogCancel>
                                        <Button
                                            variant="destructive"
                                            disabled={!deletePassword || deleteAccountMutation.isPending}
                                            onClick={() => deleteAccountMutation.mutate(deletePassword)}
                                        >
                                            {deleteAccountMutation.isPending
                                                ? (isRtl ? 'جاري الحذف...' : 'Deleting...')
                                                : (isRtl ? 'نعم، احذف الحساب' : 'Yes, Delete Account')
                                            }
                                        </Button>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                )}
            </div>
        </Layout >
    )
}

export default ProfilePage
