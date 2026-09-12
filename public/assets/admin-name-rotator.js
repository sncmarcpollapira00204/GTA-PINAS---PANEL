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
            /* Global header contract: identical slim bar on every view. */
            .top-nav {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                height: 58px !important;
                min-height: 58px !important;
                max-height: 58px !important;
                padding: 0 22px !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                flex: 0 0 58px !important;
                overflow: hidden !important;
            }
            .top-nav-left {
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                max-height: 58px !important;
                margin: 0 !important;
                padding: 0 !important;
                gap: 0 !important;
                box-sizing: border-box !important;
            }
            #mobile-menu-toggle {
                flex: 0 0 auto !important;
                margin: 0 !important;
            }

            .server-identity.registered-handler-badge {
                display: inline-flex !important;
                flex-direction: row !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 6px !important;
                width: max-content !important;
                max-width: min(90vw, 520px) !important;
                min-width: 0 !important;
                flex: 0 1 auto !important;
                align-self: center !important;
                height: auto !important;
                max-height: 28px !important;
                margin: 0 !important;
                padding: 4px 12px !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                white-space: nowrap !important;
                border: 1px solid var(--border) !important;
                border-radius: 999px !important;
                background: var(--bg-card) !important;
                color: var(--text-main) !important;
                box-shadow: none !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }

            .server-identity.registered-handler-badge strong {
                display: inline-flex !important;
                align-items: center !important;
                width: auto !important;
                min-width: 0 !important;
                flex: 0 1 auto !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                color: var(--text-sec) !important;
                font-family: 'Inter', sans-serif !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                line-height: 1 !important;
                letter-spacing: .06em !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;
            }

            .server-identity.registered-handler-badge span {
                display: inline-block !important;
                width: auto !important;
                min-width: 0 !important;
                max-width: 360px !important;
                flex: 0 1 auto !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                color: var(--text-main) !important;
                font-family: 'Inter', sans-serif !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                line-height: 1.2 !important;
                letter-spacing: 0 !important;
                text-align: left !important;
                text-transform: none !important;
                transform: none !important;
                white-space: nowrap !important;
            }

            .admin-name-rotator {
                display: inline-block !important;
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
                45% { opacity: 0.28; }
            }

            @media (max-width: 900px) {
                .server-identity.registered-handler-badge {
                    max-width: calc(100vw - 72px) !important;
                    padding: 4px 10px !important;
                    gap: 6px !important;
                }
                .server-identity.registered-handler-badge span {
                    max-width: min(48vw, 300px) !important;
                }
            }

            @media (max-width: 620px) {
                .top-nav {
                    height: 58px !important;
                    min-height: 58px !important;
                    max-height: 58px !important;
                    padding: 0 10px !important;
                }
                .top-nav-left {
                    gap: 6px !important;
                    max-height: 58px !important;
                }
                .server-identity.registered-handler-badge {
                    max-width: calc(100vw - 64px) !important;
                    padding: 4px 8px !important;
                    gap: 5px !important;
                }
                .server-identity.registered-handler-badge strong {
                    font-size: 10px !important;
                    letter-spacing: .04em !important;
                }
                .server-identity.registered-handler-badge span {
                    max-width: calc(100vw - 160px) !important;
                    font-size: 12px !important;
                }
            }

            @media (max-width: 480px) {
                .server-identity.registered-handler-badge {
                    max-width: calc(100vw - 56px) !important;
                    padding: 4px 7px !important;
                    gap: 4px !important;
                }
                .server-identity.registered-handler-badge strong {
                    max-width: 42vw !important;
                    font-size: 9px !important;
                }
                .server-identity.registered-handler-badge span {
                    max-width: 43vw !important;
                    font-size: 11px !important;
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
