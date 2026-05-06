import Header from './Header'
import MobileNav from './MobileNav'
import VerificationBanner from './VerificationBanner'

const Layout = ({ children }) => {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Header />
            <div className="pt-16">
                <VerificationBanner />
            </div>
            <main className="container flex-1 py-4 pb-24 md:py-8 md:pb-12">
                {children}
            </main>
            <MobileNav />
        </div>
    )
}

export default Layout
