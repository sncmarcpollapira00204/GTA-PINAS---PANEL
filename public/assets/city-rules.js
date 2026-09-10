'use strict';

(() => {
  const ARTICLES = [
    {
      category: 'city-law',
      number: 'Article 1',
      title: 'Illegal Mods & Third-Party Software',
      rules: [
        'Section 1.1 — Prohibited modifications include Bullet Penetration modifications, illegal movement modifications, illegal CLEO/ASI/MoonLoader/SAMPFUNCS or similar modifications, and any modification that provides an unfair advantage.',
        'Section 1.2 — Cheats, hacks, injectors, trainers, or unauthorized third-party software are prohibited and may result in severe punishment, including a possible Permanent Ban.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 2',
      title: 'Powergaming',
      rules: [
        'Section 2.1 — Power Gaming is the use or abuse of game mechanics, systems, or unrealistic actions to gain an unfair advantage or create situations that would not reasonably happen in realistic roleplay.',
        'Section 2.2 — Players must prioritize realistic roleplay over game mechanics at all times.',
        'Section 2.3 — Abusing animations, vehicle mechanics, movement mechanics, or other game limitations to avoid RP consequences may be considered Power Gaming.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 3',
      title: 'Bug Exploiting',
      rules: [
        'Section 3.1 — Intentionally abusing bugs, glitches, or unintended game mechanics to gain an advantage is prohibited.',
        'Section 3.2 — Discovered bugs must be reported instead of exploited.',
        'Section 3.3 — Canceling animations or using /stopanim or /stuck to gain an unfair advantage is prohibited.',
        'Section 3.4 — Repeated or intentional exploitation of a bug may result in heavier sanctions depending on its impact.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 4',
      title: 'Sexual Roleplay',
      rules: [
        'Section 4.1 — Sexual roleplay involving harassment, rape, sexual assault, or explicit sexual activity is prohibited without clear consent.',
        'Section 4.2 — Explicit sexual emotes or descriptions are prohibited.',
        'Section 4.3 — Forcing another player into sexual favors or sexual scenarios is prohibited.',
        'Section 4.4 — Unwanted sexual advances, harassment, or inappropriate behavior may result in immediate punishment.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 5',
      title: 'Offensive Roleplay',
      rules: [
        'Section 5.1 — Roleplay involving extreme torture, dismemberment, or excessively disturbing scenarios may require staff intervention.',
        'Section 5.2 — Racial discrimination, prejudice, or degrading someone based on race is prohibited.',
        'Section 5.3 — Homophobic or discriminatory slurs used to directly attack, insult, demean, or target a person or group are prohibited.',
        'Section 5.4 — Direct discriminatory remarks targeting an individual based on identity, appearance, gender expression, or perceived sexuality may result in a Permanent Ban depending on severity.',
        'Section 5.5 — Indirect discriminatory stereotypes or offensive remarks may still result in punishment.',
        'Section 5.6 — Trash talk may be allowed when it remains within reasonable roleplay or competitive context. Using trash talk as an excuse for harassment, discrimination, or personal attacks is prohibited.',
        'Enforcement Guide — Staff may consider the target, intent, surrounding conversation, severity, previous violations, and overall impact on the community.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 6',
      title: 'Business Rules',
      rules: [
        'Section 6.1 — Businesses must maintain reasonable prices consistent with the established city economy.',
        'Section 6.2 — Business locations are not automatically considered Safe Zones unless specifically designated by Management.',
        'Section 6.3 — Businesses may ban gangs, individuals, or government personnel from their establishment when justified by RP or business policy.',
        'Section 6.4 — Police and Sheriff personnel may assist businesses in resolving conflicts but must remain neutral and follow proper RP procedures.',
        'Section 6.5 — Gangs may have connections with businesses when supported by valid roleplay.',
        'Section 6.6 — Weapons may be carried or drawn inside businesses only when supported by valid roleplay.',
        'Section 6.7 — Shootouts inside businesses may occur when properly initiated through RP. Consequences may include business bans, police intervention, or wanted status.',
        'Section 6.8 — Hold-ups inside businesses are prohibited after the applicable restriction described by the city rules.',
        'Section 6.9 — Kidnapping scenarios may still be conducted when properly roleplayed.',
        'Section 6.12 — Stash vehicles located outside a business may be stolen or looted without verbal RP. Any interaction occurring inside the business premises must follow proper RP.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 7',
      title: 'Immunity',
      rules: [
        'Section 8.1 — Players with immunity may not be robbed, intentionally harmed, or forced into an RP situation that would result in robbery or unnecessary harm.',
        'Section 8.2 — Immunity becomes VOID if the player initiates violence, participates in criminal activities, intentionally provokes a hostile scenario, or becomes directly involved in an illegal activity.',
        'Section 8.3 — Immunity does not automatically protect a player from kidnapping or hostage RP, provided their money and items are not taken.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 9',
      title: 'Looting / Vulture',
      rules: [
        'Section 9.1 — EMS personnel who are actively on duty cannot be looted.',
        'Section 9.4 — Players not involved in an active gang-versus-gang war may not loot participants during the ongoing conflict.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 10',
      title: 'New Citizen',
      rules: [
        'Section 10.1 — New Citizens are still subject to all city rules and sanctions. Being new does not exempt anyone from punishment.',
        'Section 10.2 — Harming a New Citizen during their first day is prohibited unless the New Citizen initiates or becomes directly involved in a hostile scenario.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 11',
      title: 'Combat Logging',
      rules: [
        'Section 11.1 — Disconnecting from the server to avoid death, arrest, robbery, item loss, or RP consequences is prohibited.',
        'Section 11.2 — Players who disconnect unintentionally must provide valid proof, such as screenshots, crash logs, or video evidence, when requested.',
        'Section 11.3 — Using Accept Death or a similar mechanic to avoid being looted or to escape RP consequences is considered Combat Logging.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 12',
      title: 'Breaking Roleplay',
      rules: [
        'Section 12.1 — Players must remain in-character (IC) while participating in active roleplay.',
        'Section 12.2 — Players should allow an RP scenario to properly develop and conclude before filing a complaint whenever possible.',
        'Section 12.3 — Using OOC arguments to interrupt or manipulate an active RP scenario is prohibited.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 13',
      title: 'Vehicle Deathmatch (VDM)',
      rules: [
        'Section 13.1 — Using a vehicle to intentionally hit, injure, or kill another player without valid RP reason is prohibited.',
        'Section 13.2 — Randomly running over players, intentionally ramming vehicles, or using vehicles as weapons without proper RP justification is considered VDM.',
        'Section 13.3 — If a legitimate vehicle accident causes injury or death, the driver must check on the affected player and properly continue the RP.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 14',
      title: 'Random Deathmatch (RDM)',
      rules: [
        'Section 14.1 — RDM occurs when a player kills another player without a valid RP reason, proper interaction, or escalation.',
        'Section 14.2 — Shooting a player simply because they are nearby, without proper initiation or RP context, is considered RDM.',
        'Section 14.3 — If verbal interaction occurred but the situation was not properly escalated before gunplay, the incident may be classified as Low Quality Roleplay.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 15',
      title: 'Metagaming',
      rules: [
        'Section 15.1 — Metagaming occurs when a player uses information their character could not realistically know. Sources may include Discord, OOC chat, livestreams, screenshots, external communication, or other OOC sources.',
        'Section 15.2 — Players may only act on information their character legitimately knows within the roleplay environment.',
        'Section 15.3 — Recognizing a player by their appearance or known character identity is not automatically considered Metagaming.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 16',
      title: 'Report & Proof Policy',
      rules: [
        'Section 16.1 — All reports must contain sufficient and valid evidence.',
        'Section 16.2 — Screenshots, video clips, logs, or other approved evidence may be required depending on the report.',
        'Section 16.3 — Reports submitted without sufficient proof may be denied.',
        'Section 16.4 — Players involved in a report must provide their correct in-game name and Discord identity when requested by Management.',
        'Section 16.5 — False reports, manipulated evidence, or intentionally misleading information may result in sanctions against the reporter.',
        'Section 16.6 — Management reserves the right to review additional evidence before issuing a final decision.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 17',
      title: 'New Life Rule (NLR)',
      rules: [
        'Section 17.1 — After dying and respawning, your character is considered to have started a New Life.',
        'Section 17.2 — After death, your character must forget the identity of the attacker, the location, the circumstances surrounding the death, and information learned immediately before death.',
        'Section 17.3 — After respawning, players may not return to the death location for revenge, relay information about their death to others IC, or continue the same conflict without new RP.'
      ]
    },
    {
      category: 'city-law',
      number: 'Article 18',
      title: 'Continuous Roleplay',
      rules: [
        'Section 18.1 — An RP scenario does not automatically end after a shootout, death, revive, or arrest.',
        'Section 18.2 — RP may continue logically after medical treatment or revival.'
      ]
    }
  ];

  const DISCORD_RULES = [
    'Section 1.1 — Trash talk is acceptable in the spirit of the game, but discrimination, hate speech, toxic behavior, or harassment is not tolerated.',
    'Section 2.1 — Posting or spamming +18 content (NSFW or nudity), suspicious links/downloads, or potential viruses is prohibited.',
    'Section 3.1 — Distribution of personal information such as OOC name, address, pictures, or similar information is strictly prohibited.',
    'Section 4.1 — Disrespect or threats directed toward GTA Pinas Staff and Management will result in a permanent ban from the server.'
  ];

  const POINT_WAR_RULES = [
    'Point War is treated as an OOC competitive event. Participants are not required to maintain IC continuity while actively participating.',
    'Players killed during an active Point War may return to the Point War area unlimited times until the Point War is officially declared finished by the authorized organizer or staff.',
    'The unlimited-return rule applies only to the active Point War and does not extend to unrelated RP scenarios outside the Point War.'
  ];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function installStyles() {
    if (document.getElementById('gta-city-rules-styles')) return;
    const style = document.createElement('style');
    style.id = 'gta-city-rules-styles';
    style.textContent = `
      #nav-city-rules { order: 0; }
      #nav-city-rules .city-rules-icon { width: 16px; height: 16px; flex: 0 0 16px; }
      #view-city-rules { padding-bottom: 40px; }
      .city-rules-toolbar { display:flex; gap:12px; align-items:center; margin-bottom:22px; flex-wrap:wrap; }
      .city-rules-search { flex:1 1 280px; min-width:220px; display:flex; align-items:center; gap:9px; background:var(--bg-card); border:1px solid var(--border); border-radius:9px; padding:10px 13px; }
      .city-rules-search input { width:100%; background:transparent; border:0; outline:0; color:var(--text-main); font-size:13px; }
      .city-rules-filter { background:var(--bg-card); color:var(--text-main); border:1px solid var(--border); border-radius:9px; padding:10px 12px; min-width:190px; outline:none; }
      .city-rules-summary { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border:1px solid var(--border); background:linear-gradient(145deg, rgba(88,101,242,.08), rgba(17,17,19,.88)); border-radius:12px; margin-bottom:18px; }
      .city-rules-summary strong { display:block; font-size:14px; }
      .city-rules-summary span { color:var(--text-sec); font-size:12px; }
      .city-rules-group { margin-bottom:26px; }
      .city-rules-group h2 { font-size:16px; margin:0 0 10px; }
      .city-rules-group > p { margin:0 0 12px; font-size:13px; }
      .city-rule { border:1px solid var(--border); background:var(--bg-card); border-radius:11px; margin:9px 0; overflow:hidden; }
      .city-rule[open] { border-color:rgba(88,101,242,.35); }
      .city-rule summary { cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:15px 17px; }
      .city-rule summary::-webkit-details-marker { display:none; }
      .city-rule summary::after { content:'+'; color:var(--text-sec); font-size:18px; line-height:1; }
      .city-rule[open] summary::after { content:'−'; color:var(--text-main); }
      .city-rule-number { color:var(--primary); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin-bottom:3px; }
      .city-rule-title { font-size:14px; font-weight:650; }
      .city-rule-body { padding:0 17px 17px; border-top:1px solid var(--border); }
      .city-rule-body ul { margin:13px 0 0; padding-left:18px; }
      .city-rule-body li { color:var(--text-sec); font-size:13px; line-height:1.65; margin:7px 0; }
      .city-rule-body li::marker { color:var(--primary); }
      .city-rules-note { margin-top:8px; padding:15px 17px; border:1px solid var(--border); border-radius:10px; background:rgba(255,255,255,.02); color:var(--text-sec); font-size:12px; line-height:1.6; }
      .city-rules-empty { display:none; padding:30px 20px; text-align:center; color:var(--text-sec); border:1px dashed var(--border-light); border-radius:12px; }
      @media (max-width:760px) { .city-rules-toolbar { gap:9px; } .city-rules-summary { align-items:flex-start; flex-direction:column; } }
    `;
    document.head.appendChild(style);
  }

  function buildRuleCards() {
    const container = document.getElementById('city-rules-content');
    if (!container || container.dataset.built === 'true') return;

    const sections = [
      { id: 'discord', title: 'Discord Rules', subtitle: 'City Code No. 1', type: 'discord' },
      { id: 'city-law', title: 'Roleplay & City Rules', subtitle: 'City Law No. 2', type: 'city-law' },
      { id: 'point-war', title: 'Point War Rules', subtitle: 'OOC Competitive Event', type: 'point-war' }
    ];

    const sectionMarkup = sections.map((section) => {
      let cards = '';
      if (section.type === 'discord') {
        cards = `<details class="city-rule" data-category="discord" data-search="discord rules section 1.1 2.1 3.1 4.1">
          <summary><div><div class="city-rule-number">City Code No. 1</div><div class="city-rule-title">Discord Rules</div></div></summary>
          <div class="city-rule-body"><ul>${DISCORD_RULES.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></div>
        </details>`;
      } else if (section.type === 'point-war') {
        cards = `<details class="city-rule" data-category="point-war" data-search="point war ooc competitive return area unlimited">
          <summary><div><div class="city-rule-number">Point War</div><div class="city-rule-title">Point War Rules</div></div></summary>
          <div class="city-rule-body"><ul>${POINT_WAR_RULES.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></div>
        </details>`;
      } else {
        cards = ARTICLES.map((article) => `<details class="city-rule" data-category="city-law" data-search="${escapeHtml((article.number + ' ' + article.title + ' ' + article.rules.join(' ')).toLowerCase())}">
          <summary><div><div class="city-rule-number">${escapeHtml(article.number)}</div><div class="city-rule-title">${escapeHtml(article.title)}</div></div></summary>
          <div class="city-rule-body"><ul>${article.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></div>
        </details>`).join('');
      }

      return `<section class="city-rules-group" data-section="${section.id}">
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.subtitle)}</p>
        ${cards}
      </section>`;
    }).join('');

    container.innerHTML = sectionMarkup + `<div id="city-rules-empty" class="city-rules-empty">No rules match your search.</div>`;
    container.dataset.built = 'true';
  }

  function setActiveView() {
    document.querySelectorAll('.view-section').forEach((section) => section.classList.remove('active'));
    const view = document.getElementById('view-city-rules');
    if (view) view.classList.add('active');

    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    const nav = document.getElementById('nav-city-rules');
    if (nav) nav.classList.add('active');
  }

  function hideCityRules() {
    const view = document.getElementById('view-city-rules');
    if (view) view.classList.remove('active');
    const nav = document.getElementById('nav-city-rules');
    if (nav) nav.classList.remove('active');
  }

  function filterRules() {
    const input = document.getElementById('city-rules-search-input');
    const filter = document.getElementById('city-rules-category');
    const query = String(input?.value || '').trim().toLowerCase();
    const category = String(filter?.value || 'all');
    let visible = 0;

    document.querySelectorAll('#city-rules-content .city-rules-group').forEach((group) => {
      const cards = group.querySelectorAll('.city-rule');
      let groupVisible = 0;
      cards.forEach((card) => {
        const matchesCategory = category === 'all' || card.dataset.category === category;
        const haystack = String(card.dataset.search || '').toLowerCase();
        const matchesSearch = !query || haystack.includes(query);
        card.style.display = matchesCategory && matchesSearch ? '' : 'none';
        if (matchesCategory && matchesSearch) { groupVisible += 1; visible += 1; }
      });
      group.style.display = groupVisible ? '' : 'none';
    });

    const empty = document.getElementById('city-rules-empty');
    if (empty) empty.style.display = visible ? 'none' : 'block';
  }

  function ensureView() {
    if (document.getElementById('view-city-rules')) return;
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    const view = document.createElement('section');
    view.className = 'view-section';
    view.id = 'view-city-rules';
    view.innerHTML = `
      <div class="page-header">
        <div><h1>City Rules</h1><p>GTA Pinas Roleplay rules, organized for quick staff reference.</p></div>
      </div>
      <div class="city-rules-toolbar">
        <label class="city-rules-search"><i data-lucide="search" style="width:16px;height:16px"></i><input id="city-rules-search-input" type="search" placeholder="Search rules, articles, sections..." autocomplete="off"></label>
        <select id="city-rules-category" class="city-rules-filter" aria-label="Filter rules">
          <option value="all">All Rules</option>
          <option value="discord">Discord Rules</option>
          <option value="city-law">City Law No. 2</option>
          <option value="point-war">Point War Rules</option>
        </select>
      </div>
      <div class="city-rules-summary"><div><strong>Centralized Rulebook</strong><span>Browse the current documented GTA Pinas rules by category.</span></div><span>Click an article to expand</span></div>
      <div id="city-rules-content"></div>
      <div class="city-rules-note"><strong>Note:</strong> All rules must be followed as stated. Ignorance of the rules is not an excuse. Exploiting loopholes or intentionally bending the rules for personal advantage is strictly prohibited. No one is above the law.</div>
    `;
    contentArea.appendChild(view);
    buildRuleCards();

    document.getElementById('city-rules-search-input')?.addEventListener('input', filterRules);
    document.getElementById('city-rules-category')?.addEventListener('change', filterRules);
  }

  function ensureNav() {
    if (document.getElementById('nav-city-rules')) return;
    const management = document.getElementById('nav-management-menu');
    if (!management || !management.parentElement) return;

    const nav = document.createElement('a');
    nav.href = '#';
    nav.className = 'nav-item city-rules-nav';
    nav.id = 'nav-city-rules';
    nav.dataset.gtaCityRules = 'true';
    nav.innerHTML = '<i class="city-rules-icon" data-lucide="book-open-check"></i><span>City Rules</span>';
    management.parentElement.insertBefore(nav, management);

    nav.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveView();
      filterRules();
      window.renderPanelIcons?.({ immediate: true });
    });
  }

  function bindOtherNav() {
    if (document.documentElement.dataset.cityRulesNavBound === 'true') return;
    document.documentElement.dataset.cityRulesNavBound = 'true';

    document.addEventListener('click', (event) => {
      const target = event.target.closest?.('.nav-item');
      if (!target || target.id === 'nav-city-rules') return;
      hideCityRules();
    }, true);
  }

  function init() {
    installStyles();
    ensureView();
    ensureNav();
    bindOtherNav();
    window.renderPanelIcons?.({ immediate: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
