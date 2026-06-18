import type { ComponentType, SVGProps } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  IconBell,
  IconCalendar,
  IconCheckCircle,
  IconChevronRight,
  IconFeed,
  IconHeart,
  IconLogIn,
  IconLogOut,
  IconMenu,
  IconPlusSquare,
  IconSliders,
  IconUser,
} from './components/NavGlyphs'
import { BrandLogo } from './components/BrandLogo'
import { ScrollToTop } from './components/ScrollToTop'
import { SidebarCitySelect } from './components/SidebarCitySelect'
import { useQueryClient } from '@tanstack/react-query'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { EventDetailPage } from './pages/EventDetailPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { HomePage } from './pages/HomePage'
import { MyEventsPage } from './pages/MyEventsPage'
import { MY_EVENTS_SUBNAV } from './pages/myEventsNav'
import { CreateEventPage } from './pages/CreateEventPage'
import { EditEventPage } from './pages/EditEventPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { AccountPage } from './pages/AccountPage'
import { SettingsPage } from './pages/SettingsPage'
import { ADMIN_SUBNAV } from './pages/adminNav'
import { AdminPage } from './pages/AdminPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { RequireAuth } from './components/RequireAuth'
import { useMe } from './features/auth/queries'
import { canModerate } from './features/auth/types'
import { useAdminAccessAllowed } from './lib/adminAccess'
import { useNotifications } from './features/notifications/queries'
import { syncPushSubscription, syncPushSubscriptionFromSwMessage } from './lib/push'
import { useAuthStore } from './stores/authStore'
import { useCityStore } from './stores/cityStore'
import { getMobileScreenTitle } from './lib/mobileScreenTitle'

type NavGlyph = ComponentType<SVGProps<SVGSVGElement>>

type NavDef = {
  to: string
  end?: boolean
  title: string
  label: string
  Icon: NavGlyph
  variant?: 'default' | 'cta'
}

const MY_EVENTS_NAV_ICONS: Record<string, NavGlyph> = {
  '/my/organized': IconCalendar,
  '/my/attending': IconUser,
  '/create': IconPlusSquare,
}

const MY_EVENTS_NAV: NavDef[] = MY_EVENTS_SUBNAV.map((item) => ({
  to: item.to,
  title: item.label,
  label: item.label,
  Icon: MY_EVENTS_NAV_ICONS[item.to] ?? IconCalendar,
}))

const FEED_NAV: NavDef = { to: '/', end: true, title: 'Лента и поиск', label: 'Лента', Icon: IconFeed }

const FAVORITES_NAV: NavDef = { to: '/favorites', title: 'Избранное', label: 'Избранное', Icon: IconHeart }

const NOTIFICATIONS_NAV: NavDef = {
  to: '/notifications',
  title: 'Уведомления',
  label: 'Уведомления',
  Icon: IconBell,
}

const ADMIN_NAV_ICONS: Record<string, NavGlyph> = {
  '/admin/dashboard': IconSliders,
  '/admin/users': IconUser,
  '/admin/pending': IconCheckCircle,
  '/admin/complaints': IconBell,
}

const ADMIN_NAV: NavDef[] = ADMIN_SUBNAV.map((item) => ({
  to: item.to,
  title: item.label,
  label: item.label,
  Icon: ADMIN_NAV_ICONS[item.to] ?? IconSliders,
}))

const LOGIN_NAV: NavDef = { to: '/login', title: 'Вход', label: 'Вход', Icon: IconLogIn, variant: 'cta' }

function isMobileMenuRoute(pathname: string, showAdmin: boolean) {
  if (pathname.startsWith('/my')) return true
  if (pathname.startsWith('/favorites')) return true
  if (pathname.startsWith('/settings')) return true
  if (pathname.startsWith('/notifications')) return true
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return true
  if (pathname.startsWith('/forgot-password') || pathname.startsWith('/reset-password')) return true
  if (pathname.startsWith('/verify-email')) return true
  if (pathname.startsWith('/create')) return true
  if (pathname.startsWith('/events/') && pathname.endsWith('/edit')) return true
  if (showAdmin && pathname.startsWith('/admin')) return true
  return false
}

function isMobileProfileRoute(pathname: string, isAuthed: boolean) {
  if (pathname.startsWith('/account')) return true
  if (isAuthed && pathname.startsWith('/settings')) return true
  if (!isAuthed && pathname === '/login') return true
  return false
}

function MobileTopBar({
  isAuthed,
  hasUnreadNotifications,
}: {
  isAuthed: boolean
  hasUnreadNotifications: boolean
}) {
  const location = useLocation()
  const title = getMobileScreenTitle(location.pathname)

  return createPortal(
    <header className="mobileTopBar" aria-label="Навигация">
      <div className="mobileTopBarInner">
        <NavLink to="/" end className="mobileTopBarLogo" title="На главную" aria-label="Point — на главную">
          <BrandLogo className="brandLogoPurple" />
        </NavLink>
        <h1 className="mobileTopBarTitle">{title}</h1>
        {isAuthed ? (
          <NavLink
            to="/notifications"
            state={location.pathname.startsWith('/notifications') ? undefined : { from: location.pathname }}
            className={({ isActive }: { isActive: boolean }) =>
              isActive ? 'mobileTopBarNotif active' : 'mobileTopBarNotif'
            }
            title="Уведомления"
            aria-label="Уведомления"
          >
            <IconBell />
            {hasUnreadNotifications ? <span className="navUnreadDot" /> : null}
          </NavLink>
        ) : (
          <span className="mobileTopBarSpacer" aria-hidden />
        )}
      </div>
    </header>,
    document.body
  )
}

function EventDetailRoute() {
  const { eventId } = useParams()
  return (
    <RouteErrorBoundary title="Не удалось открыть событие">
      <EventDetailPage key={eventId} />
    </RouteErrorBoundary>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'navItem active' : 'navItem'
}

function navLinkClass(item: NavDef) {
  return ({ isActive }: { isActive: boolean }) => {
    const base = navClass({ isActive })
    return item.variant === 'cta' ? `${base} navItemCta` : base
  }
}

function MobileBottomNav({
  isAuthed,
  showAdmin,
}: {
  isAuthed: boolean
  showAdmin: boolean
}) {
  const location = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const sheetTitleId = useId()
  const sheetLinks = [
    ...(isAuthed ? MY_EVENTS_NAV : []),
    ...(isAuthed ? [{ to: '/favorites', title: 'Избранное', label: 'Избранное', Icon: IconHeart }] : []),
    ...(isAuthed ? [{ to: '/settings', title: 'Настройки', label: 'Настройки', Icon: IconSliders }] : []),
    ...(showAdmin ? ADMIN_NAV : []),
    ...(isAuthed ? [] : [{ to: '/login', title: 'Вход', label: 'Вход', Icon: IconLogIn, variant: 'cta' as const }]),
  ]

  const closeSheet = useCallback(() => setSheetOpen(false), [])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSheet()
        queueMicrotask(() => menuBtnRef.current?.focus())
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [sheetOpen, closeSheet])

  const feedActive = location.pathname === '/'
  const profileActive = isMobileProfileRoute(location.pathname, isAuthed)
  const menuTabActive = sheetOpen || isMobileMenuRoute(location.pathname, showAdmin)

  return createPortal(
    <>
      <nav className="mobileTabBar" aria-label="Основная навигация">
        <div className="mobileTabBarTrack">
          <NavLink
            to="/"
            end
            className={({ isActive }: { isActive: boolean }) => (isActive || feedActive ? 'mobileTabItem active' : 'mobileTabItem')}
            title="Лента и поиск"
          >
            <span className="mobileTabIcon" aria-hidden>
              <IconFeed />
            </span>
            <span className="mobileTabLabel">Лента</span>
          </NavLink>

          <button
            ref={menuBtnRef}
            type="button"
            className={menuTabActive ? 'mobileTabItem mobileTabItemButton active' : 'mobileTabItem mobileTabItemButton'}
            aria-expanded={sheetOpen}
            aria-controls="mobile-nav-sheet"
            onClick={() => setSheetOpen((o) => !o)}
            title="Меню разделов"
          >
            <span className="mobileTabIcon" aria-hidden>
              <IconMenu />
            </span>
            <span className="mobileTabLabel">Меню</span>
          </button>

          <NavLink
            to={isAuthed ? '/account' : '/login'}
            className={() => (profileActive ? 'mobileTabItem active' : 'mobileTabItem')}
            title={isAuthed ? 'Мой профиль' : 'Вход'}
          >
            <span className="mobileTabIcon" aria-hidden>
              <IconUser />
            </span>
            <span className="mobileTabLabel">{isAuthed ? 'Профиль' : 'Вход'}</span>
          </NavLink>
        </div>
      </nav>

      <div
        className={sheetOpen ? 'mobileSheetBackdrop open' : 'mobileSheetBackdrop'}
        aria-hidden={!sheetOpen}
        onClick={closeSheet}
      />

      <div
        id="mobile-nav-sheet"
        className={sheetOpen ? 'mobileSheet open' : 'mobileSheet'}
        role="dialog"
        aria-modal="true"
        aria-hidden={!sheetOpen}
        aria-labelledby={sheetTitleId}
      >
        <div className="mobileSheetHandle" aria-hidden />
        <div className="mobileSheetHead">
          <h2 id={sheetTitleId} className="mobileSheetTitle">
            Разделы
          </h2>
          <button type="button" className="mobileSheetClose" onClick={closeSheet} aria-label="Закрыть меню">
            ×
          </button>
        </div>
        <nav className="mobileSheetNav" aria-label="Все разделы">
          {sheetLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }: { isActive: boolean }) =>
                ['mobileSheetLink', item.variant === 'cta' ? 'mobileSheetLinkCta' : '', isActive ? 'active' : '']
                  .filter(Boolean)
                  .join(' ')
              }
              onClick={closeSheet}
            >
              <span className="mobileSheetLinkIcon" aria-hidden>
                <item.Icon />
              </span>
              <span className="mobileSheetLinkText">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>,
    document.body
  )
}

export default function App() {
  const location = useLocation()
  const qc = useQueryClient()
  const hydrate = useCityStore((s) => s.hydrate)
  const detectCityFromGeolocation = useCityStore((s) => s.detectCityFromGeolocation)
  const hydrateAuth = useAuthStore((s) => s.hydrate)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setUser = useAuthStore((s) => s.setUser)
  const meQ = useMe(Boolean(token))
  const notificationsQ = useNotifications()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    hydrate()
    detectCityFromGeolocation()
    hydrateAuth()
    void qc.invalidateQueries({ queryKey: ['catalog'] })
  }, [hydrate, detectCityFromGeolocation, hydrateAuth, qc])

  useEffect(() => {
    if (!meQ.data) return
    const current = useAuthStore.getState().user
    if (current?.id === meQ.data.id && current.email === meQ.data.email && current.role === meQ.data.role) {
      return
    }
    setUser(meQ.data)
  }, [meQ.data, setUser])

  useEffect(() => {
    if (!token || !user?.notify_push) return
    const id = window.setTimeout(() => {
      void syncPushSubscription()
    }, 2_000)
    return () => window.clearTimeout(id)
  }, [token, user?.notify_push])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; subscription?: PushSubscriptionJSON } | null
      if (data?.type !== 'push-subscription-changed' || !data.subscription || !token) return
      void syncPushSubscriptionFromSwMessage(data.subscription)
    }
    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
  }, [token])

  const isAuthed = Boolean(token)
  const adminAccessAllowed = useAdminAccessAllowed()
  const showAdmin = canModerate(user?.role) && adminAccessAllowed
  const hasUnreadNotifications = Boolean(notificationsQ.data?.some((item) => !item.is_read))

  return (
    <div className={sidebarCollapsed ? 'appShell appShellSidebarCollapsed' : 'appShell'}>
      <aside className={sidebarCollapsed ? 'sidebar sidebarCollapsed' : 'sidebar'}>
        <div className="brandRow sidebarBrand">
          <BrandLogo />
          <SidebarCitySelect />
        </div>

        <div className="sidebarBody">
          <nav className="nav navPrimary" aria-label="Основные разделы">
            <div className="navGroupTitle">Меню</div>
            <NavLink to={FEED_NAV.to} end={FEED_NAV.end} className={navLinkClass(FEED_NAV)} title={FEED_NAV.title}>
              <span className="navIcon" aria-hidden>
                <FEED_NAV.Icon />
              </span>
              <span className="navItemLabel">{FEED_NAV.label}</span>
            </NavLink>

            {isAuthed ? (
              <div className="navSubmenu">
                <div className="navGroupTitle">Мои события</div>
                {MY_EVENTS_NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navLinkClass(item)} title={item.title}>
                    <span className="navIcon" aria-hidden>
                      <item.Icon />
                    </span>
                    <span className="navItemLabel">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}

            {isAuthed ? (
              <NavLink to={FAVORITES_NAV.to} className={navLinkClass(FAVORITES_NAV)} title={FAVORITES_NAV.title}>
                <span className="navIcon" aria-hidden>
                  <FAVORITES_NAV.Icon />
                </span>
                <span className="navItemLabel">{FAVORITES_NAV.label}</span>
              </NavLink>
            ) : null}

            <div className="navSpacer" />

            {showAdmin ? (
              <div className="navSubmenu">
                <div className="navGroupTitle">Админ</div>
                {ADMIN_NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navLinkClass(item)} title={item.title}>
                    <span className="navIcon" aria-hidden>
                      <item.Icon />
                    </span>
                    <span className="navItemLabel">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </nav>
        </div>

        <div className="sidebarFooter">
          {isAuthed ? (
            <nav className="nav navFooter" aria-label="Уведомления">
              <NavLink
                to={NOTIFICATIONS_NAV.to}
                state={location.pathname.startsWith('/notifications') ? undefined : { from: location.pathname }}
                className={navLinkClass(NOTIFICATIONS_NAV)}
                title={NOTIFICATIONS_NAV.title}
              >
                <span className="navIcon navIconWithBadge" aria-hidden>
                  <NOTIFICATIONS_NAV.Icon />
                  {hasUnreadNotifications ? <span className="navUnreadDot" /> : null}
                </span>
                <span className="navItemLabel">{NOTIFICATIONS_NAV.label}</span>
              </NavLink>
            </nav>
          ) : null}
          <div className="footerDivider" role="presentation" />
          <NavLink
            to={isAuthed ? '/account' : '/login'}
            className={({ isActive }: { isActive: boolean }) => `userCard${isActive ? ' active' : ''}`}
            title={isAuthed ? 'Аккаунт' : 'Вход'}
          >
            <div className="userAvatar" aria-hidden>
              {isAuthed && user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="userAvatarPhoto" />
              ) : (
                <IconUser />
              )}
            </div>
            <div className="userCardText">
              <span className="userCardTitle">{isAuthed ? user?.display_name ?? 'Аккаунт' : 'Аккаунт'}</span>
              <span className="userCardSub">
                {isAuthed ? user?.email ?? 'Профиль' : 'Войдите для доступа'}
              </span>
            </div>
            <span className="userCardChevron" aria-hidden>
              <IconChevronRight />
            </span>
          </NavLink>

          <nav className="nav navFooter" aria-label="Сервис аккаунта">
            {isAuthed ? (
              <button type="button" className="navItem navItemCta navItemButton" onClick={() => logout()} title="Выход">
                <span className="navIcon" aria-hidden>
                  <IconLogOut />
                </span>
                <span className="navItemLabel">Выход</span>
              </button>
            ) : (
              <NavLink to="/login" className={navLinkClass(LOGIN_NAV)} title="Вход">
                <span className="navIcon" aria-hidden>
                  <IconLogIn />
                </span>
                <span className="navItemLabel">Вход</span>
              </NavLink>
            )}
          </nav>
        </div>
        <button
          type="button"
          className={sidebarCollapsed ? 'sidebarCollapseBtn collapsed' : 'sidebarCollapseBtn'}
          aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          aria-pressed={sidebarCollapsed}
          title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          <IconChevronRight />
        </button>
      </aside>

      <main className="main">
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/events/:eventId" element={<EventDetailRoute />} />
          <Route path="/search" element={<Navigate to="/#home-search" replace />} />
          <Route
            path="/my/*"
            element={
              <RequireAuth>
                <MyEventsPage />
              </RequireAuth>
            }
          />
          <Route path="/archive" element={<Navigate to="/my" replace />} />
          <Route
            path="/create"
            element={
              <RequireAuth>
                <CreateEventPage />
              </RequireAuth>
            }
          />
          <Route
            path="/events/:eventId/edit"
            element={
              <RequireAuth>
                <EditEventPage />
              </RequireAuth>
            }
          />
          <Route
            path="/favorites"
            element={
              <RequireAuth>
                <FavoritesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <NotificationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/*"
            element={
              <RequireAuth roles={['admin']}>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/profile" element={<Navigate to="/account" replace />} />
          <Route path="*" element={<PlaceholderPage title="Страница не найдена" />} />
        </Routes>
      </main>

      <MobileTopBar isAuthed={isAuthed} hasUnreadNotifications={hasUnreadNotifications} />
      <MobileBottomNav isAuthed={isAuthed} showAdmin={showAdmin} />
    </div>
  )
}
