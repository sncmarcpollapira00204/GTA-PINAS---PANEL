'use strict';

(() => {
    const ROTATING_TARGET_SELECTOR = '.server-identity span';
    const DASHBOARD_TITLE_SELECTOR = '#view-dashboard .dashboard-brand-copy h1';
    const DASHBOARD_CREDIT_SELECTOR = '.dashboard-brand-copy p';
    const BRAND_TITLE_SELECTOR = '.brand-copy h2, .brand-copy strong, .sidebar-header h2, .sidebar-header strong';
    const BRAND_TITLE = '5th Avenue Roleplay';
    const DEVELOPER_CREDIT = 'Developed and Maintained by curtcreation.dev';
    const CHANGE_INTERVAL_MS = 3200;
    const FADE_DURATION_MS = 180;

    let admins = [];
    let currentIndex = 0;
    let rotationTimer = null;

    function getRotatingTargets() {
        return Array.from(document.querySelectorAll(ROTATING_TARGET_SELECTOR));
    }

    function applyStaticBranding() {
        document.querySelectorAll(BRAND_TITLE_SELECTOR).forEach((element) => {
            if (String(element.textContent || '').trim().toLowerCase() === '5th avenue') {
                element.textContent = BRAND_TITLE;
            }
        });

        document.querySelectorAll(DASHBOARD_TITLE_SELECTOR).forEach((element) => {
            element.textContent = BRAND_TITLE;
        });

        document.querySelectorAll(DASHBOARD_CREDIT_SELECTOR).forEach((element) => {
            element.textContent = DEVELOPER_CREDIT;
            element.classList.remove('admin-name-rotator', 'is-changing', 'is-visible');
        });

        document.querySelectorAll('.server-identity').forEach((identity) => {
            identity.classList.add('registered-handler-badge');
            const label = identity.querySelector('strong');
            if (label) label.textContent = 'Registered Handler';
        });
    }

    function ensureStyles() {
        if (document.getElementById('admin-name-rotator-styles')) return;

        const style = document.createElement('style');
        style.id = 'admin-name-rotator-styles';
        style.textContent = `
            .top-nav-left {
                display: flex !important;
                align-items: center !important;
            }
            .server-identity.registered-handler-badge {
                width: 209px !important;
                height: 31px !important;
                min-width: 209px !important;
                max-width: 209px !important;
                flex: 0 0 209px !important;
                display: grid !important;
                grid-template-columns: 88px minmax(0, 1fr) !important;
                align-items: center !important;
                column-gap: 7px !important;
                padding: 0 10px !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                border: 1px solid #263037 !important;
                border-radius: 7px !important;
                background: #0b141b !important;
                box-shadow: none !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }
            .server-identity.registered-handler-badge strong {
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                color: #919da9 !important;
                font-family: 'Inter', sans-serif !important;
                font-size: 6.35px !important;
                font-weight: 700 !important;
                line-height: 1 !important;
                letter-spacing: .82px !important;
                text-align: left !important;
                text-overflow: clip !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;
            }
            .server-identity.registered-handler-badge span {
                --handler-font-size: 9px;
                --handler-scale: 1;
                min-width: 0 !important;
                width: auto !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                color: #f5f7fa !important;
                font-family: 'Inter', sans-serif !important;
                font-size: var(--handler-font-size) !important;
                font-weight: 700 !important;
                line-height: 1 !important;
                letter-spacing: -.08px !important;
                text-align: left !important;
                text-overflow: clip !important;
                text-transform: none !important;
                transform: scaleX(var(--handler-scale)) !important;
                transform-origin: left center !important;
                white-space: nowrap !important;
            }
            .admin-name-rotator {
                display: block;
                transition: opacity ${FADE_DURATION_MS}ms ease, transform ${FADE_DURATION_MS}ms ease;
                will-change: opacity, transform;
            }
            .admin-name-rotator.is-changing {
                opacity: 0;
                transform: translateY(2px) scaleX(var(--handler-scale)) !important;
            }
            .admin-name-rotator.is-visible {
                animation: admin-name-blink 520ms ease;
            }
            @keyframes admin-name-blink {
                0%, 100% { opacity: 1; }
                45% { opacity: 0.28; }
            }
            @media (max-width: 620px) {
                .server-identity.registered-handler-badge {
                    width: min(209px, calc(100vw - 88px)) !important;
                    min-width: 0 !important;
                    max-width: calc(100vw - 88px) !important;
                    flex-basis: auto !important;
                    grid-template-columns: 82px minmax(0, 1fr) !important;
                    column-gap: 6px !important;
                    padding: 0 8px !important;
                }
                .server-identity.registered-handler-badge strong {
                    font-size: 5.9px !important;
                    letter-spacing: .68px !important;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .admin-name-rotator {
                    transition: none;
                    animation: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function preferredFontSize(text) {
        const length = String(text || '').length;
        if (length <= 16) return 9;
        if (length <= 20) return 8.6;
        if (length <= 24) return 8.1;
        if (length <= 29) return 7.5;
        return 7;
    }

    function fitHandlerText(target, text) {
        const fontSize = preferredFontSize(text);
        target.style.setProperty('--handler-font-size', `${fontSize}px`);
        target.style.setProperty('--handler-scale', '1');

        window.requestAnimationFrame(() => {
            const availableWidth = target.clientWidth;
            const neededWidth = target.scrollWidth;
            if (!availableWidth || neededWidth <= availableWidth) return;

            const scale = Math.min(1, availableWidth / neededWidth);
            target.style.setProperty('--handler-scale', scale.toFixed(3));
        });
    }

    function setTargetText(target, text) {
        target.textContent = text;
        fitHandlerText(target, text);
    }

    function setRotatingText(text, animate = false) {
        const targets = getRotatingTargets();
        if (!targets.length) return;

        targets.forEach((target) => {
            target.classList.add('admin-name-rotator');
            if (!animate) {
                setTargetText(target, text);
                return;
            }

            target.classList.add('is-changing');
            window.setTimeout(() => {
                setTargetText(target, text);
                target.classList.remove('is-changing');
                target.classList.remove('is-visible');
                void target.offsetWidth;
                target.classList.add('is-visible');
            }, FADE_DURATION_MS);
        });
    }

    function displayName(profile) {
        return profile.display_name
            || profile.guild_nickname
            || profile.global_name
            || profile.username
            || profile.label
            || 'Admin';
    }

    function displayRank(profile) {
        return profile.rank_label
            || profile.staff_role
            || profile.description
            || profile.server_role
            || '';
    }

    function normalizeProfiles(profiles) {
        const unique = new Map();

        profiles.forEach((profile) => {
            const name = String(displayName(profile)).trim();
            if (!name) return;

            const key = String(profile.id || profile.user_id || name).toLowerCase();
            if (!unique.has(key)) unique.set(key, profile);
        });

        return Array.from(unique.values()).sort((left, right) => {
            const rankDifference = Number(left.rank_order ?? 999) - Number(right.rank_order ?? 999);
            if (rankDifference) return rankDifference;
            return displayName(left).localeCompare(displayName(right), undefined, { sensitivity: 'base' });
        });
    }

    function showNextAdmin() {
        if (!admins.length) {
            setRotatingText('5th Avenue Admin Team');
            return;
        }

        const admin = admins[currentIndex % admins.length];
        const name = displayName(admin);
        const rank = displayRank(admin);
        setRotatingText(rank ? `${name} · ${rank}` : name, true);
        currentIndex = (currentIndex + 1) % admins.length;
    }

    function startRotation() {
        if (rotationTimer) window.clearInterval(rotationTimer);
        currentIndex = 0;
        showNextAdmin();
        if (admins.length > 1) {
            rotationTimer = window.setInterval(showNextAdmin, CHANGE_INTERVAL_MS);
        }
    }

    async function loadAdmins() {
        setRotatingText('Loading handlers...');

        try {
            const response = await fetch('/api/staff', {
                cache: 'no-store',
                credentials: 'same-origin'
            });
            const profiles = await response.json().catch(() => []);
            if (!response.ok || !Array.isArray(profiles)) {
                throw new Error('Unable to load handler roster.');
            }

            admins = normalizeProfiles(profiles);
        } catch (error) {
            console.warn('[ADMIN NAME ROTATOR]', error.message || error);
            admins = [];
        }

        startRotation();
    }

    function init() {
        applyStaticBranding();
        ensureStyles();
        void loadAdmins();
        window.addEventListener('pageshow', applyStaticBranding);
        window.addEventListener('resize', () => {
            getRotatingTargets().forEach((target) => fitHandlerText(target, target.textContent));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
