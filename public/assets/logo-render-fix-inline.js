(() => {
  const apply = () => {
    document.querySelectorAll('.brand-mark.brand-logo img').forEach((img) => {
      img.src = '/assets/logo.png?v=20260911-logo';
      img.hidden = false;
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('width', '100%', 'important');
      img.style.setProperty('height', '100%', 'important');
      img.style.setProperty('object-fit', 'contain', 'important');
      img.style.setProperty('object-position', 'center', 'important');
    });
  };

  const installProfileLogout = () => {
    if (document.getElementById('panel-profile-logout-menu')) return;

    const sidebarBottom = document.querySelector('.sidebar-bottom');
    if (!sidebarBottom) return;

    const profile = sidebarBottom.querySelector('.user-profile, .sidebar-user, .user-card') || sidebarBottom.firstElementChild;
    if (!profile) return;

    const style = document.createElement('style');
    style.id = 'panel-profile-logout-styles';
    style.textContent = `
      .sidebar-bottom { position: relative !important; z-index: 100 !important; pointer-events: auto !important; }
      .sidebar-bottom > *, .sidebar-bottom .user-profile, .sidebar-bottom .sidebar-user, .sidebar-bottom .user-card {
        pointer-events: auto !important;
      }
      #panel-profile-logout-menu {
        position: fixed;
        left: 12px;
        bottom: 76px;
        width: 220px;
        padding: 7px;
        z-index: 99999;
        background: #111113;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 10px;
        box-shadow: 0 12px 35px rgba(0,0,0,.55);
        display: none;
      }
      #panel-profile-logout-menu.open { display: block; }
      #panel-profile-logout-menu button {
        width: 100%;
        height: 38px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #ef4444;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 11px;
        font: 600 12px Inter, sans-serif;
        cursor: pointer;
        text-align: left;
      }
      #panel-profile-logout-menu button:hover { background: rgba(239,68,68,.10); }
      #panel-profile-logout-menu button:disabled { opacity: .6; cursor: wait; }
    `;
    document.head.appendChild(style);

    const menu = document.createElement('div');
    menu.id = 'panel-profile-logout-menu';
    menu.innerHTML = '<button type="button" id="panel-profile-signout"><span>↪</span><span>Sign out</span></button>';
    document.body.appendChild(menu);

    const closeMenu = () => menu.classList.remove('open');

    const openMenu = (event) => {
      if (event) event.stopPropagation();
      menu.classList.toggle('open');
    };

    profile.addEventListener('click', openMenu, true);
    sidebarBottom.addEventListener('click', (event) => {
      if (event.target.closest('#panel-profile-logout-menu')) return;
      if (event.target.closest('.sidebar-bottom')) openMenu(event);
    }, true);

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !sidebarBottom.contains(event.target)) closeMenu();
    });

    document.getElementById('panel-profile-signout').addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      button.disabled = true;
      button.querySelector('span:last-child').textContent = 'Signing out...';

      try {
        let csrf = typeof window.panelCsrfToken === 'string' ? window.panelCsrfToken : '';
        if (!csrf) {
          const me = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
          const data = await me.json().catch(() => ({}));
          csrf = String(data.csrfToken || '');
        }

        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
          },
          body: '{}',
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Sign out failed (${response.status}).`);
        }

        window.location.replace('/login');
      } catch (error) {
        button.disabled = false;
        button.querySelector('span:last-child').textContent = 'Sign out';
        if (typeof window.showToast === 'function') window.showToast(error.message, 'error');
        else console.error('[PROFILE SIGN OUT]', error);
      }
    });
  };

  const run = () => {
    apply();
    installProfileLogout();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
})();