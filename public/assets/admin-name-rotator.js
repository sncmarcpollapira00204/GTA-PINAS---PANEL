'use strict';

(() => {
    const ROTATING_TARGET_SELECTOR = '.server-identity span';
    const DASHBOARD_TITLE_SELECTOR = '#view-dashboard .dashboard-brand-copy h1';
    const DASHBOARD_CREDIT_SELECTOR = '.dashboard-brand-copy p';
    const BRAND_TITLE_SELECTOR = '.brand-copy h2, .brand-copy strong, .sidebar-header h2, .sidebar-header strong';
    const BRAND_TITLE = 'GTA Pinas Roleplay';
    const DEVELOPER_CREDIT = 'Developed and Maintained by Cipher & Aezakmi';
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
            /* Shared top-bar alignment */
            .top-nav-left {
                display: flex !important;
                align-items: center !important;
                min-width: 0 !important;
                gap: 12px !important;
            }

            /* Modern registered-handler pill */
            .server-identity.registered-handler-badge {
                position: relative !important;
                width: min(460px, 42vw) !important;
                min-width: 220px !important;
                max-width: 460px !important;
                height: 36px !important;
                min-height: 36px !important;
                flex: 0 1 auto !important;

                display: inline-flex !important;
                align-items: center !important;
                gap: 9px !important;

                padding: 0 12px 0 11px !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                overflow: hidden !important;

                border: 1px solid rgba(255,255,255,.10) !important;
                border-radius: 10px !important;

                background:
                    linear-gradient(
                        180deg,
                        rgba(255,255,255,.055),
                        rgba(255,255,255,.025)
                    ) !important;

                box-shadow:
                    inset 0 1px 0 rgba(255,255,255,.035),
                    0 4px 14px rgba(0,0,0,.18) !important;

                color: var(--text-main) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                transform: translateZ(0) !important;
                transition: border-color .2s ease, background .2s ease, box-shadow .2s ease !important;
            }

            .server-identity.registered-handler-badge:hover {
                border-color: rgba(59,130,246,.36) !important;
                background:
                    linear-gradient(
                        180deg,
                        rgba(255,255,255,.065),
                        rgba(255,255,255,.03)
                    ) !important;
                box-shadow:
                    inset 0 1px 0 rgba(255,255,255,.04),
                    0 6px 18px rgba(0,0,0,.22),
                    0 0 0 1px rgba(59,130,246,.05) !important;
            }

            /* Online indicator */
            .server-identity.registered-handler-badge::before {
                content: '';
                width: 7px;
                height: 7px;
                flex: 0 0 7px;
                border-radius: 50%;
                background: #22C55E;
                box-shadow:
                    0 0 0 3px rgba(34,197,94,.10),
                    0 0 10px rgba(34,197,94,.28);
            }

            /* Label tag */
            .server-identity.registered-handler-badge strong {
                position: relative !important;
                min-width: 0 !important;
                flex: 0 0 auto !important;
                margin: 0 !important;
                padding: 4px 7px !important;

                color: #8E9BAD !important;
                font-family: 'Inter', sans-serif !important;
                font-size: 7px !important;
                font-weight: 800 !important;
                line-height: 1 !important;
                letter-spacing: .10em !important;
                text-align: center !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;

                border: 1px solid rgba(255,255,255,.07) !important;
                border-radius: 6px !important;
                background: rgba(255,255,255,.035) !important;
            }

            /* Thin separator between label and current handler */
            .server-identity.registered-handler-badge::after {
                content: '';
                width: 1px;
                height: 16px;
                flex: 0 0 1px;
                background: rgba(255,255,255,.10);
                margin-left: 0;
                margin-right: -1px;
            }

            /* Dynamic handler username • role */
            .server-identity.registered-handler-badge span {
                min-width: 0 !important;
                width: auto !important;
                flex: 1 1 auto !important;
                margin: 0 !important;
                padding: 0 !important;

                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;

                color: #F4F7FB !important;
                font-family: 'Inter', sans-serif !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                line-height: 1.1 !important;
                letter-spacing: -.01em !important;
                text-align: left !important;
                text-transform: none !important;

                transform: none !important;
                transform-origin: left center !important;
            }

            .admin-name-rotator {
                display: block;
                max-width: 100%;
                transition: opacity ${FADE_DURATION_MS}ms ease, transform ${FADE_DURATION_MS}ms ease;
                will-change: opacity, transform;
            }

            .admin-name-rotator.is-changing {
                opacity: 0;
                transform: translateY(2px) !important;
            }

            .admin-name-rotator.is-visible {
                animation: admin-name-blink 520ms ease;
            }

            @keyframes admin-name-blink {
                0%, 100% { opacity: 1; }
                45% { opacity: .28; }
            }

            /* Respect the final top-nav height and prevent edge clipping. */
            .top-nav .server-identity.registered-handler-badge {
                align-self: center !important;
            }

            @media (max-width: 900px) {
                .server-identity.registered-handler-badge {
                    width: min(390px, 58vw) !important;
                    max-width: 390px !important;
                }
            }

            @media (max-width: 620px) {
                .server-identity.registered-handler-badge {
                    width: min(250px, calc(100vw - 92px)) !important;
                    min-width: 0 !important;
                    max-width: calc(100vw - 92px) !important;
                    height: 34px !important;
                    min-height: 34px !important;
                    padding: 0 9px !important;
                    gap: 7px !important;
                    border-radius: 9px !important;
                }

                .server-identity.registered-handler-badge strong {
                    font-size: 6px !important;
                    letter-spacing: .08em !important;
                    padding: 4px 6px !important;
                }

                .server-identity.registered-handler-badge span {
                    font-size: 9px !important;
                }
            }

            @media (max-width: 480px) {
                .server-identity.registered-handler-badge strong {
                    display: none !important;
                }

                .server-identity.registered-handler-badge::after {
                    display: none;
                }

                .server-identity.registered-handler-badge {
                    width: min(205px, calc(100vw - 88px)) !important;
                    max-width: calc(100vw - 88px) !important;
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
            setRotatingText('GTA Pinas Admin Team');
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

    function fitHandlerText(target, text) {
        target.title = text || '';
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
