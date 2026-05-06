import React, { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Layout from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Calendar, ShieldCheck, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
}

const FeatureCard = ({ icon: Icon, title, description }) => (
    <Card className="border-0 shadow-lg bg-card/80 backdrop-blur dark:bg-card/50 dark:border dark:border-border">
        <CardContent className="pt-6 text-center flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{title}</h3>
            <p className="text-muted-foreground">{description}</p>
        </CardContent>
    </Card>
)

const LandingPage = () => {
    const { t, i18n } = useTranslation()
    const isRtl = i18n.language === 'ar'
    const { user } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (user) {
            const userRole = user.role
            if (userRole === 'ADMIN') navigate('/admin')
            else if (userRole === 'DOCTOR') navigate('/doctor')
            else if (userRole === 'PATIENT') navigate('/patient')
            else if (userRole === 'SECRETARY') navigate('/secretary')
            // No else - if unknown role, stay on landing page
        }
    }, [user, navigate])

    return (
        <Layout>
            <div className="flex flex-col items-center justify-center py-10 sm:py-20 gap-8 sm:gap-16">

                {/* Hero */}
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="text-center space-y-6 max-w-3xl"
                >
                    <motion.h1
                        variants={item}
                        className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 pb-2"
                    >
                        {isRtl ? 'نظام الجدولة الذكي' : 'Smart Rescheduling System'}
                    </motion.h1>

                    <motion.p variants={item} className="text-base sm:text-xl text-muted-foreground">
                        {isRtl
                            ? 'حل النزاعات تلقائيًا واقتراح فتحات بديلة دون عناء.'
                            : 'Automatically resolve booking conflicts and suggest alternative slots effortlessly.'}
                    </motion.p>

                    <motion.div variants={item} className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 w-full sm:w-auto">
                        <Link to="/doctor">
                            <Button size="lg" className="rounded-full px-6 sm:px-8 text-base sm:text-lg shadow-blue-500/25 shadow-xl h-11 sm:h-12 w-full sm:w-auto">
                                {isRtl ? 'لوحة الطبيب' : 'Doctor Dashboard'}
                            </Button>
                        </Link>
                        {/* Patient Experience Link */}
                        <Link to="/login">
                            <Button size="lg" variant="outline" className="rounded-full px-6 sm:px-8 text-base sm:text-lg h-11 sm:h-12 w-full sm:w-auto">
                                {isRtl ? 'تجربة المريض' : 'Patient Demo'}
                            </Button>
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Features */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    viewport={{ once: true }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 w-full"
                >
                    <FeatureCard
                        icon={Calendar}
                        title={isRtl ? "إدارة الوقت" : "Smart Scheduling"}
                        description={isRtl ? "عرض التقويم المتكامل مع دعم السحب والإفلات." : "Integrated calendar view with seamless interaction."}
                    />
                    <FeatureCard
                        icon={ShieldCheck}
                        title={isRtl ? "حل النزاعات" : "Conflict Resolution"}
                        description={isRtl ? "اكتشاف الحجوزات المتداخلة وإصلاحها بنقرة واحدة." : "Detect overlapping bookings and fix them in one click."}
                    />
                    <FeatureCard
                        icon={Zap}
                        title={isRtl ? "تجربة سريعة" : "Instant Updates"}
                        description={isRtl ? "إشعارات فورية وتحديثات حية للمرضى." : "Real-time notifications and live updates for patients."}
                    />
                </motion.div>

            </div>
        </Layout>
    )
}

export default LandingPage
