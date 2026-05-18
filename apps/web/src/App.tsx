import type { ComponentType, SVGProps } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  IconCalendar,
  IconChevronRight,
  IconFeed,
  IconHeart,
  IconLogIn,
  IconMenu,
  IconPlusSquare,
  IconSettings,
  IconShield,
  IconUser,
} from './components/NavGlyphs'
import { BrandLogo } from './components/BrandLogo'
import { ScrollToTop } from './components/ScrollToTop'
import { SidebarCitySelect } from './components/SidebarCitySelect'
import { ensureDemoFavoriteReviews, ensureDemoUserEventData } from './lib/eventInteractionStorage'
import { ensureTestEvent } from './lib/localEvents'
import { ensureDemoUser } from './lib/userSession'
import { EventDetailPage } from './pages/EventDetailPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { HomePage } from './pages/HomePage'
import {
  MyAttendingEventsRoute,
  MyEventsLayout,
  MyOrganizedEventsRoute,
  MY_EVENTS_SUBNAV,
} from './pages/MyEventsPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { AccountPage } from './pages/AccountPage'
import { SettingsPage } from './pages/SettingsPage'
import { AdminPage } from './pages/AdminPage'
import { RequireAuth } from './components/RequireAuth'
import { useMe } from './features/auth/queries'
import { canModerate } from './features/auth/types'
import { useAuthStore } from './stores/authStore'
import { useCityStore } from './stores/cityStore'

type NavGlyph = ComponentType<SVGProps<SVGSVGElement>>

type NavDef = {
  to: string
  end?: boolean
  title: string
  label: string
  Icon: NavGlyph
  variant?: 'default' | 'cta'
}

type NavGroup = {
  title: string
  items: NavDef[]
}

const MY_EVENTS_NAV_ICONS: Record<string, NavGlyph> = {
  '/my/organized': IconCalendar,
  '/my/attending': IconUser,
  '/create': IconPlusSquare,
}

const MY_EVENTS_NAV: NavDef[] = MY_EVENTS_SUBNAV.map((item) => ({
  to: item.to,
  title: item.to === '/create' ? 'Создать событие' : item.label,
  label: item.label,
  Icon: MY_EVENTS_NAV_ICONS[item.to] ?? IconCalendar,
}))

const MENU_ITEMS: NavDef[] = [
  { to: '/', end: true, title: 'Лента и поиск', label: 'Лента', Icon: IconFeed },
  { to: '/favorites', title: 'Избранное', label: 'Избранное', Icon: IconHeart },
]

const MENU_GROUPS: NavGroup[] = [{ title: 'Мои события', items: MY_EVENTS_NAV }]

const SERVICE_ITEMS: NavDef[] = [{ to: '/admin', title: 'Админ-панель', label: 'Админ', Icon: IconShield }]

const FOOTER_NAV: NavDef[] = [
  { to: '/settings', title: 'Настройки', label: 'Настройки', Icon: IconSettings },
  { to: '/login', title: 'Вход', label: 'Вход', Icon: IconLogIn, variant: 'cta' },
]

/** Разделы вне табов «Лента» и «Профиль» — в нижнем листе на телефоне */
const MOBILE_SHEET_LINKS: NavDef[] = [
  ...MY_EVENTS_NAV,
  { to: '/favorites', title: 'Избранное', label: 'Избранное', Icon: IconHeart },
  { to: '/admin', title: 'Админ-панель', label: 'Админ-панель', Icon: IconShield },
  { to: '/settings', title: 'Настройки', label: 'Настройки', Icon: IconSettings },
  { to: '/login', title: 'Вход', label: 'Вход', Icon: IconLogIn, variant: 'cta' },
]

const PROFILE_PATHS = new Set(['/account', '/settings', '/login'])

function EventDetailRoute() {
  const { eventId } = useParams()
  return <EventDetailPage key={eventId} />
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

function MobileBottomNav() {
  const location = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const sheetTitleId = useId()

  const closeSheet = useCallback(() => setSheetOpen(false), [])

  useEffect(() => {
    closeSheet()
  }, [location.pathname, closeSheet])

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

  const profileActive = PROFILE_PATHS.has(location.pathname)
  const moreActive = location.pathname !== '/' && !profileActive
  const menuTabActive = sheetOpen || moreActive

  return createPortal(
    <>
      <nav className="mobileTabBar" aria-label="Основная навигация">
        <div className="mobileTabBarTrack">
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
            to="/"
            end
            className={({ isActive }: { isActive: boolean }) => (isActive ? 'mobileTabItem active' : 'mobileTabItem')}
            title="Лента и поиск"
          >
            <span className="mobileTabIcon" aria-hidden>
              <IconFeed />
            </span>
            <span className="mobileTabLabel">Лента</span>
          </NavLink>

          <NavLink
            to="/account"
            className={() => (profileActive ? 'mobileTabItem active' : 'mobileTabItem')}
            title="Аккаунт"
          >
            <span className="mobileTabIcon" aria-hidden>
              <IconUser />
            </span>
            <span className="mobileTabLabel">Профиль</span>
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
          {MOBILE_SHEET_LINKS.map((item) => (
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
  const hydrate = useCityStore((s) => s.hydrate)
  const detectCityFromGeolocation = useCityStore((s) => s.detectCityFromGeolocation)
  const hydrateAuth = useAuthStore((s) => s.hydrate)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setUser = useAuthStore((s) => s.setUser)
  const meQ = useMe(Boolean(token))

  useEffect(() => {
    hydrate()
    detectCityFromGeolocation()
    hydrateAuth()
    const demoUser = ensureDemoUser()
    const testId = ensureTestEvent(demoUser.displayName)
    ensureDemoUserEventData(testId)
    ensureDemoFavoriteReviews(testId)
  }, [hydrate, detectCityFromGeolocation, hydrateAuth])

  useEffect(() => {
    if (meQ.data) setUser(meQ.data)
  }, [meQ.data, setUser])

  const isAuthed = Boolean(token && user)
  const showAdmin = canModerate(user?.role)

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brandRow sidebarBrand">
          <BrandLogo />
          <SidebarCitySelect />
        </div>

        <div className="sidebarBody">
          <nav className="nav navPrimary" aria-label="Основные разделы">
            <div className="navGroupTitle">Меню</div>
            {MENU_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass(item)} title={item.title}>
                <span className="navIcon" aria-hidden>
                  <item.Icon />
                </span>
                <span className="navItemLabel">{item.label}</span>
              </NavLink>
            ))}

            {MENU_GROUPS.map((group) => (
              <div key={group.title} className="navSubmenu">
                <div className="navGroupTitle">{group.title}</div>
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navLinkClass(item)} title={item.title}>
                    <span className="navIcon" aria-hidden>
                      <item.Icon />
                    </span>
                    <span className="navItemLabel">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}

            <div className="navSpacer" />

            {showAdmin ? (
              <>
                <div className="navGroupTitle">Сервис</div>
                {SERVICE_ITEMS.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navLinkClass(item)} title={item.title}>
                    <span className="navIcon" aria-hidden>
                      <item.Icon />
                    </span>
                    <span className="navItemLabel">{item.label}</span>
                  </NavLink>
                ))}
              </>
            ) : null}
          </nav>
        </div>

        <div className="sidebarFooter">
          <div className="footerDivider" role="presentation" />
          <NavLink
            to={isAuthed ? '/account' : '/login'}
            className={({ isActive }: { isActive: boolean }) => `userCard${isActive ? ' active' : ''}`}
            title={isAuthed ? 'Аккаунт' : 'Вход'}
          >
            <div className="userAvatar" aria-hidden>
              <IconUser />
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
              <>
                <NavLink to="/settings" className={navLinkClass(FOOTER_NAV[0])} title="Настройки">
                  <span className="navIcon" aria-hidden>
                    <IconSettings />
                  </span>
                  <span className="navItemLabel">Настройки</span>
                </NavLink>
                <button type="button" className="navItem navItemCta navItemButton" onClick={() => logout()} title="Выход">
                  <span className="navItemLabel">Выход</span>
                </button>
              </>
            ) : (
              <NavLink to="/login" className={navLinkClass(FOOTER_NAV[1])} title="Вход">
                <span className="navIcon" aria-hidden>
                  <IconLogIn />
                </span>
                <span className="navItemLabel">Вход</span>
              </NavLink>
            )}
          </nav>
        </div>
      </aside>

      <main className="main">
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/events/:eventId" element={<EventDetailRoute />} />
          <Route path="/search" element={<Navigate to="/#home-search" replace />} />
          <Route
            path="/my"
            element={
              <RequireAuth>
                <MyEventsLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="organized" replace />} />
            <Route path="organized" element={<MyOrganizedEventsRoute />} />
            <Route path="attending" element={<MyAttendingEventsRoute />} />
          </Route>
          <Route path="/archive" element={<Navigate to="/my/attending" replace />} />
          <Route
            path="/create"
            element={
              <RequireAuth>
                <PlaceholderPage title="Создать событие" />
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
          <Route path="/account" element={<AccountPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={
              <RequireAuth roles={['moderator', 'admin']}>
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

      <MobileBottomNav />
    </div>
  )
}
