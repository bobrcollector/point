// Point Web SPA (routes aligned with MAUI AppShell)
// - Hash-based router (#/home, #/search, #/my-events, #/profile, ...)
// - Events: Firestore read + local offline events (localStorage)
// - "My events"/favorites/archive: stored locally (offline-first)

// ---------- FIREBASE (read-only for web demo) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKlO6-r2eJtMdnIFQocZhRfpz3PME39WM",
    authDomain: "point-v1.firebaseapp.com",
    databaseURL: "https://point-v1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "point-v1",
    storageBucket: "point-v1.firebasestorage.app",
    messagingSenderId: "268629065821",
    appId: "1:268629065821:web:96d2eb571202d06720cdb4",
    measurementId: "G-TLVDC9F91P"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ---------- DOM ----------
const sidebar = document.getElementById('sidebar');
const collapseBtn = document.getElementById('collapseBtn');
const appRoot = document.getElementById('app');
const logoutNav = document.getElementById('logoutNav');

// ---------- STORAGE KEYS ----------
const LS = {
    sidebarCollapsed: 'point_sidebar_collapsed',
    user: 'point_user',
    localEvents: 'point_local_events',
    planned: 'point_planned_event_ids',
    archived: 'point_archived_event_ids',
    favorites: 'point_favorite_event_ids',
    settings: 'point_settings'
};

// ---------- GLOBAL STATE ----------
let eventsDB = [];              // remote + local merged
let remoteEvents = [];
let localEvents = [];

let myMap = null;
let placemarks = [];
let currentFilteredEvents = [];
let mapInitialized = false;
let isMapVisible = false;
let yandexMapsReadyPromise = null;

const YANDEX_MAPS_API_KEY = "1a0b162d-9aa4-4d51-8441-151469a3c82a";

// ---------- HELPERS ----------
function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
}
function loadArray(key) {
    const v = safeJsonParse(localStorage.getItem(key), []);
    return Array.isArray(v) ? v : [];
}
function saveArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
}
function getUser() {
    return safeJsonParse(localStorage.getItem(LS.user), null);
}
function setUser(user) {
    if (!user) localStorage.removeItem(LS.user);
    else localStorage.setItem(LS.user, JSON.stringify(user));
    renderSidebarAuthState();
}
function getSettings() {
    return safeJsonParse(localStorage.getItem(LS.settings), { theme: 'light' });
}
function setSettings(next) {
    localStorage.setItem(LS.settings, JSON.stringify(next));
}

function mapCategory(categoryId) {
    if (!categoryId) return "Другое";
    if (categoryId.includes("Концерт") || categoryId.includes("Музыка")) return "Концерт";
    if (categoryId.includes("Театр") || categoryId.includes("Спектакль")) return "Театр";
    if (categoryId.includes("Выставка") || categoryId.includes("Арт")) return "Выставка";
    if (categoryId.includes("Спорт")) return "Спорт";
    if (categoryId.includes("Настольные игры") || categoryId.includes("Игры")) return "Игры";
    return "Другое";
}

function formatDate(isoDate) {
    if (!isoDate) return "";
    try {
        const date = new Date(isoDate);
        return date.toISOString().split('T')[0];
    } catch {
        return String(isoDate);
    }
}

function getImageForCategory(categoryId) {
    if (!categoryId) return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&h=450&fit=crop";
    if (categoryId.includes("Концерт") || categoryId.includes("Музыка"))
        return "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=900&h=450&fit=crop";
    if (categoryId.includes("Театр"))
        return "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=900&h=450&fit=crop";
    if (categoryId.includes("Выставка"))
        return "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=900&h=450&fit=crop";
    if (categoryId.includes("Спорт"))
        return "https://images.unsplash.com/photo-1522778119026-d647f0594f73?w=900&h=450&fit=crop";
    if (categoryId.includes("Настольные игры") || categoryId.includes("Игры"))
        return "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=900&h=450&fit=crop";
    return "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&h=450&fit=crop";
}

function getMockEvents() {
    return [
        { id: "mock1", name: "Концерт Басты", category: "Концерт", date: "2026-05-15", place: "Крокус Сити Холл", img: getImageForCategory("Концерт"), latitude: 55.825, longitude: 37.392, participantsCount: 45, maxParticipants: 100, description: "Живой концерт. Вход по билетам.", source: "mock" },
        { id: "mock2", name: "Лебединое озеро", category: "Театр", date: "2026-05-20", place: "Большой театр", img: getImageForCategory("Театр"), latitude: 55.760, longitude: 37.618, participantsCount: 128, maxParticipants: 200, description: "Балет в 2-х актах.", source: "mock" },
        { id: "mock3", name: "Импрессионизм: выставка", category: "Выставка", date: "2026-05-10", place: "Манеж", img: getImageForCategory("Выставка"), latitude: 55.763, longitude: 37.609, participantsCount: 30, maxParticipants: 80, description: "Коллекция работ конца XIX века.", source: "mock" },
        { id: "mock4", name: "Футбол: ЦСКА - Спартак", category: "Спорт", date: "2026-06-01", place: "ВЭБ Арена", img: getImageForCategory("Спорт"), latitude: 55.800, longitude: 37.514, participantsCount: 89, maxParticipants: 150, description: "Дерби сезона.", source: "mock" },
        { id: "mock5", name: "Настольные игры в антикафе", category: "Игры", date: "2026-05-25", place: "Антикафе «Игротека»", img: getImageForCategory("Игры"), latitude: 55.740, longitude: 37.580, participantsCount: 8, maxParticipants: 20, description: "Берите друзей, чай включён.", source: "mock" }
    ];
}

function mergeEvents(remote, local) {
    const byId = new Map();
    remote.forEach(e => byId.set(String(e.id), e));
    local.forEach(e => byId.set(String(e.id), e));
    return Array.from(byId.values());
}

function pickRoute() {
    const h = location.hash || '#/home';
    const [path, qs] = h.split('?');
    const query = new URLSearchParams(qs || '');
    return { path, query };
}

function navigate(hash) {
    location.hash = hash;
}

function escapeHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderSidebarActive(path) {
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
        const r = el.getAttribute('data-route');
        const isActive = r === path || (r === '#/my-events' && (path === '#/archive'));
        el.classList.toggle('active', !!isActive);
    });
}

function renderSidebarAuthState() {
    const user = getUser();
    if (!logoutNav) return;
    const label = logoutNav.querySelector('span:last-child');
    if (label) label.textContent = user ? 'Выход' : 'Вход';
}

// ---------- SIDEBAR COLLAPSE ----------
let isCollapsed = localStorage.getItem(LS.sidebarCollapsed) === 'true';
if (isCollapsed) sidebar.classList.add('collapsed');
else sidebar.classList.remove('collapsed');

collapseBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    sidebar.classList.toggle('collapsed', isCollapsed);
    localStorage.setItem(LS.sidebarCollapsed, String(isCollapsed));
});

// Sidebar navigation
document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.addEventListener('click', () => {
        const route = el.getAttribute('data-route');
        if (!route) return;
        // special: logout/login
        if (route === '#/login' && getUser()) {
            setUser(null);
            navigate('#/home');
            return;
        }
        navigate(route);
    });
});

// ---------- EVENT ACTIONS (offline) ----------
function toggleIdInList(key, id) {
    const list = loadArray(key).map(String);
    const sid = String(id);
    const idx = list.indexOf(sid);
    if (idx >= 0) list.splice(idx, 1);
    else list.unshift(sid);
    saveArray(key, list);
    return list;
}
function hasIdInList(key, id) {
    const list = loadArray(key).map(String);
    return list.includes(String(id));
}

function getEventById(id) {
    return eventsDB.find(e => String(e.id) === String(id)) || null;
}

// ---------- MAP (Search page) ----------
function initYandexMap(containerId = "yandexMap") {
    myMap = new ymaps.Map(containerId, {
        center: [55.751574, 37.573856],
        zoom: 10,
        controls: ['zoomControl', 'fullscreenControl']
    });

    const geolocationButton = new ymaps.control.Button({
        data: { content: "📍 Моё местоположение" },
        options: { maxWidth: 200 }
    });

    geolocationButton.events.add('click', () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userCoords = [position.coords.latitude, position.coords.longitude];
                    myMap.setCenter(userCoords, 15);
                    myMap.geoObjects.add(new ymaps.Placemark(
                        userCoords,
                        { balloonContent: "Вы здесь" },
                        { preset: 'islands#redDotIcon' }
                    ));
                },
                () => alert("Не удалось определить местоположение")
            );
        } else {
            alert("Браузер не поддерживает геолокацию");
        }
    });

    myMap.controls.add(geolocationButton, { float: 'right' });
    mapInitialized = true;
}

function ensureYandexMapsReady() {
    if (window.ymaps) return Promise.resolve(window.ymaps);
    if (yandexMapsReadyPromise) return yandexMapsReadyPromise;

    yandexMapsReadyPromise = new Promise((resolve, reject) => {
        const scriptSrc = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(YANDEX_MAPS_API_KEY)}&lang=ru_RU`;
        const existingScript = document.querySelector('script[src^="https://api-maps.yandex.ru/2.1/"]');

        const waitYmapsReady = () => {
            const ymapsApi = window.ymaps;
            if (!ymapsApi || !ymapsApi.ready) {
                safeReject(new Error("Яндекс.Карты не инициализировались. Проверьте API-ключ и домен в настройках ключа."));
                return;
            }
            ymapsApi.ready(() => safeResolve(ymapsApi));
        };

        const timeoutId = setTimeout(() => {
            reject(new Error("Не удалось загрузить Яндекс.Карты (таймаут). Проверьте сеть и блокировщики в браузере."));
        }, 15000);

        const safeResolve = (value) => {
            clearTimeout(timeoutId);
            resolve(value);
        };
        const safeReject = (error) => {
            clearTimeout(timeoutId);
            reject(error);
        };

        if (existingScript) {
            if (window.ymaps) {
                waitYmapsReady();
                return;
            }
            existingScript.addEventListener('load', () => {
                try {
                    waitYmapsReady();
                } catch (error) {
                    safeReject(error instanceof Error ? error : new Error("Ошибка загрузки Яндекс.Карт"));
                }
            }, { once: true });
            existingScript.addEventListener('error', () => {
                safeReject(new Error("Скрипт Яндекс.Карт не загрузился. Проверьте API-ключ и доступ к api-maps.yandex.ru."));
            }, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = scriptSrc;
        script.async = true;
        script.onload = () => {
            try {
                if (!window.ymaps) {
                    safeReject(new Error("Скрипт Яндекс.Карт загружен, но API недоступно. Проверьте ограничения ключа по домену."));
                    return;
                }
                window.ymaps.ready(() => safeResolve(window.ymaps));
            } catch (error) {
                safeReject(error instanceof Error ? error : new Error("Ошибка инициализации Яндекс.Карт"));
            }
        };
        script.onerror = () => {
            safeReject(new Error("Не удалось загрузить Яндекс.Карты. Проверьте сеть или блокировщик рекламы."));
        };
        document.head.appendChild(script);
    }).catch((error) => {
        yandexMapsReadyPromise = null;
        throw error;
    });

    return yandexMapsReadyPromise;
}

function renderMarkersOnMap() {
    if (!myMap) return;

    if (placemarks.length) {
        placemarks.forEach(marker => myMap.geoObjects.remove(marker));
        placemarks = [];
    }

    if (!currentFilteredEvents.length) return;

    currentFilteredEvents.forEach(event => {
        if (!event.latitude || !event.longitude) return;

        const placemark = new ymaps.Placemark(
            [event.latitude, event.longitude],
            {
                balloonContentHeader: `<b>${escapeHtml(event.name)}</b>`,
                balloonContentBody: `
                    <strong>${escapeHtml(event.category)}</strong><br>
                    📅 ${escapeHtml(event.date || '')}<br>
                    📍 ${escapeHtml(event.place || '')}<br>
                    <button data-open-event="${escapeHtml(event.id)}" class="btn-inline">Подробнее →</button>
                `,
                balloonContentFooter: `<small>ID: ${escapeHtml(event.id)}</small>`
            },
            {
                preset: event.category === "Концерт" ? "islands#musicIcon" :
                    event.category === "Театр" ? "islands#theaterIcon" :
                        event.category === "Спорт" ? "islands#sportIcon" : "islands#defaultIcon",
                iconColor: event.isFull ? "#ef4444" : "#512BD4"
            }
        );

        myMap.geoObjects.add(placemark);
        placemarks.push(placemark);
    });

    if (placemarks.length) {
        const bounds = myMap.geoObjects.getBounds();
        if (bounds) myMap.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
    }
}

function updateMapWithFilteredEvents(filteredEvents) {
    currentFilteredEvents = filteredEvents;
    if (myMap && isMapVisible) renderMarkersOnMap();
}

// ---------- UI: card renderer ----------
const calendarIconSvg = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const mapPinIconSvg = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none"><path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 5.02944 7.02944 1 12 1C16.9706 1 21 5.02944 21 10Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/></svg>';
const starIconSvg = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function renderCards(eventsArr, { emptyText = "✨ Пока пусто ✨" } = {}) {
    if (!eventsArr.length) return `<div class="no-results">${escapeHtml(emptyText)}</div>`;

    return `<div class="cards-grid">
        ${eventsArr.map(ev => {
        const fav = hasIdInList(LS.favorites, ev.id);
        const planned = hasIdInList(LS.planned, ev.id);
        return `
            <div class="event-card" data-open-event="${escapeHtml(ev.id)}">
                <div class="card-img" style="background-image: url('${escapeHtml(ev.img)}');"></div>
                <div class="card-info">
                    <div class="card-row">
                        <div class="card-category">${escapeHtml(ev.category)}</div>
                        <button class="icon-btn ${fav ? 'active' : ''}" title="В избранное" data-toggle-fav="${escapeHtml(ev.id)}">${starIconSvg}</button>
                    </div>
                    <div class="card-title">${escapeHtml(ev.name)}</div>
                    <div class="card-date">${calendarIconSvg} ${escapeHtml(ev.date || '')}</div>
                    <div class="card-place">${mapPinIconSvg} ${escapeHtml(ev.place || '')}</div>
                    <div class="card-actions">
                        <button class="pill-btn ${planned ? 'active' : ''}" data-toggle-planned="${escapeHtml(ev.id)}">${planned ? 'Запланировано' : 'Запланировать'}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('')}
    </div>`;
}

function attachGlobalHandlers() {
    // event open
    appRoot.querySelectorAll('[data-open-event]').forEach(el => {
        el.addEventListener('click', (e) => {
            // ignore if click on button inside card
            const target = e.target;
            if (target && (target.closest('[data-toggle-fav]') || target.closest('[data-toggle-planned]'))) return;
            const id = el.getAttribute('data-open-event');
            if (!id) return;
            navigate(`#/event?id=${encodeURIComponent(id)}`);
        });
    });

    // toggle favorite
    appRoot.querySelectorAll('[data-toggle-fav]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-toggle-fav');
            if (!id) return;
            toggleIdInList(LS.favorites, id);
            router(); // quick rerender
        });
    });

    // toggle planned
    appRoot.querySelectorAll('[data-toggle-planned]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-toggle-planned');
            if (!id) return;
            toggleIdInList(LS.planned, id);
            router();
        });
    });
}

// ---------- PAGES ----------
function renderLayout(title, innerHtml, { showFooter = true } = {}) {
    const footer = showFooter ? `
        <footer class="footer">
            <div class="footer-grid">
                <div class="footer-col">
                    <h4>Point</h4>
                    <p>Оффлайн‑события: поиск, создание и управление.</p>
                </div>
                <div class="footer-col">
                    <h4>Разделы</h4>
                    <a href="#/home">Лента</a>
                    <a href="#/search">Поиск</a>
                    <a href="#/my-events">Мои события</a>
                    <a href="#/profile">Профиль</a>
                </div>
                <div class="footer-col">
                    <h4>Данные</h4>
                    <a href="#/settings">Настройки</a>
                    <a href="#/create">Создать событие</a>
                </div>
                <div class="footer-col">
                    <h4>Point</h4>
                    <p>© 2026</p>
                </div>
            </div>
            <div class="footer-bottom">Яркие моменты рядом с вами</div>
        </footer>
    ` : '';

    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">${escapeHtml(title)}</div>
            </div>
            <div class="page-body">
                ${innerHtml}
            </div>
            ${footer}
        </div>
    `;
}

function pageHome() {
    const upcoming = [...eventsDB]
        .filter(e => e.date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, 12);

    const html = `
        <div class="hero-slider">
            <div class="swiper heroSwiper">
                <div class="swiper-wrapper">
                    <div class="swiper-slide" style="background-image: url('assets/images/slide_1.jpg');">
                        <div class="slide-overlay"></div>
                        <div class="slide-content">
                            <h2>Главные события сезона</h2>
                            <p>Ищите и сохраняйте оффлайн‑ивенты</p>
                        </div>
                    </div>
                    <div class="swiper-slide" style="background-image: url('assets/images/slide_2.jpg');">
                        <div class="slide-overlay"></div>
                        <div class="slide-content">
                            <h2>Планируйте заранее</h2>
                            <p>Соберите свой календарь событий</p>
                        </div>
                    </div>
                    <div class="swiper-slide" style="background-image: url('assets/images/slide_3.webp');">
                        <div class="slide-overlay"></div>
                        <div class="slide-content">
                            <h2>Создавайте свои встречи</h2>
                            <p>Добавляйте события оффлайн, даже без интернета</p>
                        </div>
                    </div>
                </div>
                <div class="swiper-pagination"></div>
            </div>
        </div>

        <div class="search-section">
            <div class="home-quick-actions">
                <a class="btn-search" href="#/search">Открыть поиск</a>
                <a class="toggle-map-btn" href="#/create">Создать событие</a>
                <a class="toggle-map-btn" href="#/my-events">Мои события</a>
            </div>
        </div>

        <div class="events-section">
            <div class="section-title">🔥 Ближайшие события</div>
            ${renderCards(upcoming, { emptyText: 'Событий пока нет — создайте своё.' })}
        </div>
    `;

    appRoot.innerHTML = renderLayout('Лента', html);

    // init slider
    try {
        new Swiper('.heroSwiper', {
            loop: true,
            autoplay: { delay: 4000 },
            pagination: { el: '.swiper-pagination', clickable: true }
        });
    } catch { }

    attachGlobalHandlers();
}

function pageSearch() {
    const html = `
        <div class="search-section">
            <div class="search-row">
                <div class="search-group" style="flex:3">
                    <label>
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="none">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
                            <path d="M20 20L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                        ПОИСК СОБЫТИЙ
                    </label>
                    <input type="text" id="searchInput" placeholder="Концерт, выставка, театр..." autocomplete="off">
                </div>
                <div class="search-group">
                    <label>ДАТА ОТ</label>
                    <input type="text" id="dateFrom" placeholder="Выберите дату">
                </div>
                <div class="search-group">
                    <label>ДАТА ДО</label>
                    <input type="text" id="dateTo" placeholder="Выберите дату">
                </div>
                <div class="search-group">
                    <label>КАТЕГОРИЯ</label>
                    <select id="categoryFilter">
                        <option value="all">Все</option>
                        <option value="Концерт">Концерт</option>
                        <option value="Театр">Театр</option>
                        <option value="Выставка">Выставка</option>
                        <option value="Спорт">Спорт</option>
                        <option value="Игры">Игры</option>
                        <option value="Другое">Другое</option>
                    </select>
                </div>
                <div class="search-group">
                    <label>СОРТИРОВКА</label>
                    <select id="sortSelect">
                        <option value="date_asc">По дате (сначала ближайшие)</option>
                        <option value="date_desc">По дате (позже)</option>
                        <option value="name_asc">По названию (А-Я)</option>
                    </select>
                </div>
                <div class="filter-buttons">
                    <button class="btn-search" id="applySearchBtn">Найти</button>
                    <button class="toggle-map-btn" id="toggleMapBtn">Карта</button>
                </div>
            </div>
        </div>

        <div id="mapContainer" class="hidden map-container-style" style="display:none; height:440px;">
            <div id="yandexMap" style="width: 100%; height: 100%;"></div>
        </div>

        <div class="events-section">
            <div class="section-title" id="sectionTitle">🔥 Подборки для вас</div>
            <div id="cardsContainer"></div>
        </div>
    `;

    appRoot.innerHTML = renderLayout('Поиск', html);

    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const sortSelect = document.getElementById('sortSelect');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const applyBtn = document.getElementById('applySearchBtn');
    const cardsContainer = document.getElementById('cardsContainer');
    const sectionTitleSpan = document.getElementById('sectionTitle');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    const mapContainer = document.getElementById('mapContainer');

    // date pickers
    try {
        flatpickr("#dateFrom", { dateFormat: "Y-m-d", defaultDate: "" });
        flatpickr("#dateTo", { dateFormat: "Y-m-d", defaultDate: "" });
    } catch { }

    function filterAndRender() {
        let query = searchInput.value.toLowerCase().trim();
        let category = categoryFilter.value;
        let fromDate = dateFrom.value;
        let toDate = dateTo.value;
        let filtered = [...eventsDB];

        if (query) filtered = filtered.filter(ev => (ev.name || '').toLowerCase().includes(query) || (ev.place || '').toLowerCase().includes(query));
        if (category !== 'all') filtered = filtered.filter(ev => ev.category === category);
        if (fromDate) filtered = filtered.filter(ev => (ev.date || '') >= fromDate);
        if (toDate) filtered = filtered.filter(ev => (ev.date || '') <= toDate);

        let sortBy = sortSelect.value;
        if (sortBy === 'date_asc') filtered.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        else if (sortBy === 'date_desc') filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        else if (sortBy === 'name_asc') filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        cardsContainer.innerHTML = renderCards(filtered, { emptyText: 'Ничего не найдено.' });
        attachGlobalHandlers();

        updateMapWithFilteredEvents(filtered);

        const isSearchActive = query !== '' || category !== 'all' || fromDate !== '' || toDate !== '';
        sectionTitleSpan.innerText = isSearchActive
            ? (filtered.length ? `🔍 Найдено событий: ${filtered.length}` : "😕 Ничего не найдено")
            : "🔥 Подборки для вас";
    }

    // Map toggle
    isMapVisible = false;
    toggleMapBtn.addEventListener('click', () => {
        isMapVisible = !isMapVisible;
        if (isMapVisible) {
            mapContainer.classList.remove('hidden');
            mapContainer.style.display = "block";
            toggleMapBtn.classList.add('active');

            if (!mapInitialized) {
                ensureYandexMapsReady()
                    .then(() => {
                        initYandexMap("yandexMap");
                        setTimeout(() => {
                            myMap?.container?.fitToViewport?.();
                            renderMarkersOnMap();
                        }, 100);
                    })
                    .catch((error) => {
                        mapContainer.innerHTML = `<div class="muted" style="padding: 16px;">${escapeHtml(error?.message || "Не удалось открыть карту")}</div>`;
                    });
            } else {
                setTimeout(() => {
                    myMap?.container?.fitToViewport?.();
                    renderMarkersOnMap();
                }, 100);
            }
        } else {
            mapContainer.classList.add('hidden');
            mapContainer.style.display = "none";
            toggleMapBtn.classList.remove('active');
        }
    });

    applyBtn.addEventListener('click', filterAndRender);
    sortSelect.addEventListener('change', filterAndRender);
    categoryFilter.addEventListener('change', filterAndRender);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') filterAndRender(); });

    // initial
    filterAndRender();
}

function pageMyEvents() {
    const plannedIds = loadArray(LS.planned).map(String);
    const planned = plannedIds.map(getEventById).filter(Boolean);
    const html = `
        <div class="events-section">
            <div class="section-title">📌 Запланированные</div>
            ${renderCards(planned, { emptyText: 'Пока нет запланированных событий.' })}
        </div>
        <div class="events-section">
            <div class="section-title">🗃️ Архив</div>
            <div class="muted">Перейдите в раздел «Архив» в меню, чтобы посмотреть.</div>
        </div>
    `;
    appRoot.innerHTML = renderLayout('Мои события', html);
    attachGlobalHandlers();
}

function pageFavorites() {
    const favIds = loadArray(LS.favorites).map(String);
    const favs = favIds.map(getEventById).filter(Boolean);
    appRoot.innerHTML = renderLayout('Избранное', `
        <div class="events-section">
            <div class="section-title">⭐ Избранное</div>
            ${renderCards(favs, { emptyText: 'Вы пока ничего не добавили в избранное.' })}
        </div>
    `);
    attachGlobalHandlers();
}

function pageArchive() {
    const archivedIds = loadArray(LS.archived).map(String);
    const archived = archivedIds.map(getEventById).filter(Boolean);
    appRoot.innerHTML = renderLayout('Архив', `
        <div class="events-section">
            <div class="section-title">🗃️ Архив</div>
            ${renderCards(archived, { emptyText: 'Архив пуст.' })}
        </div>
    `);
    attachGlobalHandlers();
}

function pageEventDetails(query) {
    const id = query.get('id');
    const ev = id ? getEventById(id) : null;
    if (!ev) {
        appRoot.innerHTML = renderLayout('Детали события', `<div class="no-results">Событие не найдено.</div>`);
        return;
    }

    const fav = hasIdInList(LS.favorites, ev.id);
    const planned = hasIdInList(LS.planned, ev.id);
    const archived = hasIdInList(LS.archived, ev.id);

    appRoot.innerHTML = renderLayout('Детали события', `
        <div class="details">
            <div class="details-hero" style="background-image:url('${escapeHtml(ev.img)}')">
                <div class="details-overlay"></div>
                <div class="details-hero-content">
                    <div class="details-badge">${escapeHtml(ev.category)}</div>
                    <h2>${escapeHtml(ev.name)}</h2>
                    <div class="details-meta">
                        <span>${calendarIconSvg} ${escapeHtml(ev.date || '')}</span>
                        <span>${mapPinIconSvg} ${escapeHtml(ev.place || '')}</span>
                    </div>
                </div>
            </div>

            <div class="details-body">
                <div class="details-actions">
                    <button class="btn-search" data-toggle-planned="${escapeHtml(ev.id)}">${planned ? 'Убрать из запланированных' : 'Запланировать'}</button>
                    <button class="toggle-map-btn ${fav ? 'active' : ''}" data-toggle-fav="${escapeHtml(ev.id)}">${fav ? 'В избранном' : 'В избранное'}</button>
                    <button class="toggle-map-btn ${archived ? 'active' : ''}" id="archiveBtn">${archived ? 'Убрать из архива' : 'В архив'}</button>
                    <button class="toggle-map-btn" onclick="location.hash='#/search'">К поиску</button>
                </div>

                <div class="details-card">
                    <h3>Описание</h3>
                    <p>${escapeHtml(ev.description || 'Описание не добавлено.')}</p>
                </div>
            </div>
        </div>
    `, { showFooter: false });

    // archive toggle
    const archiveBtn = document.getElementById('archiveBtn');
    archiveBtn?.addEventListener('click', () => {
        toggleIdInList(LS.archived, ev.id);
        router();
    });

    attachGlobalHandlers();
}

function pageCreate() {
    appRoot.innerHTML = renderLayout('Создание события', `
        <div class="form-card">
            <div class="muted">Событие сохранится оффлайн (в браузере). Позже можно связать с Firestore/авторизацией.</div>
            <form id="createForm" class="form-grid">
                <div class="field">
                    <label>Название</label>
                    <input id="evName" type="text" required placeholder="Например: Встреча настольщиков" />
                </div>
                <div class="field">
                    <label>Категория</label>
                    <select id="evCategory">
                        <option value="Концерт">Концерт</option>
                        <option value="Театр">Театр</option>
                        <option value="Выставка">Выставка</option>
                        <option value="Спорт">Спорт</option>
                        <option value="Игры">Игры</option>
                        <option value="Другое" selected>Другое</option>
                    </select>
                </div>
                <div class="field">
                    <label>Дата</label>
                    <input id="evDate" type="text" placeholder="YYYY-MM-DD" />
                </div>
                <div class="field">
                    <label>Место</label>
                    <input id="evPlace" type="text" placeholder="Адрес или место встречи" />
                </div>
                <div class="field full">
                    <label>Описание</label>
                    <textarea id="evDesc" rows="5" placeholder="Что будет? условия? как найти?"></textarea>
                </div>
                <div class="field">
                    <label>Широта</label>
                    <input id="evLat" type="number" step="0.000001" placeholder="55.75" />
                </div>
                <div class="field">
                    <label>Долгота</label>
                    <input id="evLng" type="number" step="0.000001" placeholder="37.61" />
                </div>
                <div class="field full">
                    <div class="form-actions">
                        <button class="btn-search" type="submit">Создать</button>
                        <a class="toggle-map-btn" href="#/home">Отмена</a>
                    </div>
                </div>
            </form>
        </div>
    `, { showFooter: false });

    try {
        flatpickr("#evDate", { dateFormat: "Y-m-d", defaultDate: "" });
    } catch { }

    const form = document.getElementById('createForm');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = `local_${Date.now()}`;
        const name = document.getElementById('evName').value.trim();
        const category = document.getElementById('evCategory').value;
        const date = document.getElementById('evDate').value;
        const place = document.getElementById('evPlace').value.trim();
        const description = document.getElementById('evDesc').value.trim();
        const lat = Number(document.getElementById('evLat').value);
        const lng = Number(document.getElementById('evLng').value);

        const ev = {
            id,
            name,
            category,
            date: date ? date : "",
            place,
            img: getImageForCategory(category),
            latitude: Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            description,
            source: "local"
        };

        localEvents = loadArray(LS.localEvents);
        localEvents.unshift(ev);
        localStorage.setItem(LS.localEvents, JSON.stringify(localEvents));

        eventsDB = mergeEvents(remoteEvents, localEvents);
        toggleIdInList(LS.planned, id); // auto add to planned
        navigate(`#/event?id=${encodeURIComponent(id)}`);
    });
}

function pageProfile() {
    const user = getUser();
    if (!user) {
        appRoot.innerHTML = renderLayout('Профиль', `
            <div class="form-card">
                <h3>Вы не вошли</h3>
                <p class="muted">В веб-версии пока используется оффлайн-профиль (без Firebase Auth).</p>
                <div class="form-actions">
                    <a class="btn-search" href="#/login">Войти</a>
                    <a class="toggle-map-btn" href="#/register">Регистрация</a>
                </div>
            </div>
        `, { showFooter: false });
        return;
    }

    appRoot.innerHTML = renderLayout('Профиль', `
        <div class="form-card">
            <h3>${escapeHtml(user.displayName || user.email || 'Пользователь')}</h3>
            <div class="muted">Email: ${escapeHtml(user.email || '—')}</div>
            <div class="form-actions" style="margin-top:16px;">
                <a class="toggle-map-btn" href="#/settings">Настройки</a>
                <a class="toggle-map-btn" href="#/my-events">Мои события</a>
            </div>
        </div>
    `, { showFooter: false });
}

function pageSettings() {
    const settings = getSettings();
    appRoot.innerHTML = renderLayout('Настройки', `
        <div class="form-card">
            <div class="field">
                <label>Тема</label>
                <select id="themeSelect">
                    <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Светлая</option>
                    <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Тёмная</option>
                </select>
            </div>
            <div class="field">
                <button class="toggle-map-btn" id="clearLocalBtn">Сбросить оффлайн‑данные</button>
            </div>
        </div>
    `, { showFooter: false });

    document.getElementById('themeSelect')?.addEventListener('change', (e) => {
        const theme = e.target.value;
        setSettings({ ...settings, theme });
        applyTheme();
    });

    document.getElementById('clearLocalBtn')?.addEventListener('click', () => {
        if (!confirm('Удалить локальные события/избранное/планы?')) return;
        localStorage.removeItem(LS.localEvents);
        localStorage.removeItem(LS.planned);
        localStorage.removeItem(LS.archived);
        localStorage.removeItem(LS.favorites);
        localEvents = [];
        eventsDB = mergeEvents(remoteEvents, localEvents);
        navigate('#/home');
    });
}

function pageLogin() {
    appRoot.innerHTML = renderLayout('Вход', `
        <div class="form-card">
            <form id="loginForm" class="form-grid">
                <div class="field">
                    <label>Email</label>
                    <input id="loginEmail" type="email" required placeholder="name@example.com" />
                </div>
                <div class="field full">
                    <div class="form-actions">
                        <button class="btn-search" type="submit">Войти</button>
                        <a class="toggle-map-btn" href="#/register">Регистрация</a>
                    </div>
                </div>
            </form>
        </div>
    `, { showFooter: false });

    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        setUser({ email, displayName: email.split('@')[0] });
        navigate('#/profile');
    });
}

function pageRegister() {
    appRoot.innerHTML = renderLayout('Регистрация', `
        <div class="form-card">
            <form id="regForm" class="form-grid">
                <div class="field">
                    <label>Имя</label>
                    <input id="regName" type="text" required placeholder="Имя" />
                </div>
                <div class="field">
                    <label>Email</label>
                    <input id="regEmail" type="email" required placeholder="name@example.com" />
                </div>
                <div class="field full">
                    <div class="form-actions">
                        <button class="btn-search" type="submit">Создать профиль</button>
                        <a class="toggle-map-btn" href="#/login">Войти</a>
                    </div>
                </div>
            </form>
        </div>
    `, { showFooter: false });

    document.getElementById('regForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const displayName = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        setUser({ email, displayName });
        navigate('#/profile');
    });
}

function pageStub(title, text) {
    appRoot.innerHTML = renderLayout(title, `<div class="form-card"><div class="muted">${escapeHtml(text)}</div></div>`, { showFooter: false });
}

// ---------- ROUTER ----------
function router() {
    const { path, query } = pickRoute();
    renderSidebarActive(path);

    // reset map state when leaving search
    if (path !== '#/search') {
        isMapVisible = false;
        currentFilteredEvents = [];
    }

    switch (path) {
        case '#/home': return pageHome();
        case '#/search': return pageSearch();
        case '#/my-events': return pageMyEvents();
        case '#/favorites': return pageFavorites();
        case '#/archive': return pageArchive();
        case '#/create': return pageCreate();
        case '#/event': return pageEventDetails(query);
        case '#/profile': return pageProfile();
        case '#/settings': return pageSettings();
        case '#/login': return pageLogin();
        case '#/register': return pageRegister();
        case '#/admin': return pageStub('Админ', 'Панель модератора будет добавлена следующей итерацией.');
        case '#/reports': return pageStub('Жалобы', 'Управление жалобами будет добавлено следующей итерацией.');
        case '#/filter': return pageStub('Фильтры', 'Фильтры уже доступны на странице «Поиск».');
        case '#/map-picker': return pageStub('Выбор места', 'Для веб-версии выбор координат пока делается полями широта/долгота в «Создать».');
        default:
            navigate('#/home');
            return;
    }
}

// ---------- DATA LOAD ----------
async function loadEventsFromFirestore() {
    try {
        const eventsCollection = collection(db, "events");
        const querySnapshot = await getDocs(eventsCollection);
        remoteEvents = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            remoteEvents.push({
                id: doc.id,
                name: data.Name || data.Title || data.CategoryId || "Без названия",
                category: mapCategory(data.CategoryId || data.Category || ""),
                date: formatDate(data.EventDate || data.Date || ""),
                place: data.Address || data.Place || "Место не указано",
                img: getImageForCategory(data.CategoryId || data.Category || ""),
                latitude: data.Latitude ?? null,
                longitude: data.Longitude ?? null,
                participantsCount: data.ParticipantsCount || 0,
                maxParticipants: data.MaxParticipants || 0,
                description: data.Description || "",
                isFull: data.IsFull || false,
                source: "firestore"
            });
        });

        if (remoteEvents.length === 0) remoteEvents = getMockEvents();
    } catch {
        remoteEvents = getMockEvents();
    }

    localEvents = safeJsonParse(localStorage.getItem(LS.localEvents), []);
    if (!Array.isArray(localEvents)) localEvents = [];

    eventsDB = mergeEvents(remoteEvents, localEvents);
    router();
}

function applyTheme() {
    const { theme } = getSettings();
    document.body.classList.toggle('theme-dark', theme === 'dark');
}

// ---------- BOOT ----------
renderSidebarAuthState();
applyTheme();
window.addEventListener('hashchange', router);
if (!location.hash) location.hash = '#/home';
loadEventsFromFirestore();