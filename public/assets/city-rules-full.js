'use strict';

(() => {
  const RULE_SECTIONS = [
    {
      type: 'heading',
      title: 'CITY LAW NO. 2 — ROLEPLAY & CITY RULES',
      intro: 'All citizens are required to understand and follow the rules below. Ignorance of the rules does not excuse a violation.'
    },
    {
      type: 'article', number: 'ARTICLE 1', title: 'ILLEGAL MODS & THIRD-PARTY SOFTWARE', rules: [
        'Section 1.1 — Prohibited modifications include Bullet Penetration modifications, illegal movement modifications, illegal CLEO, ASI, MoonLoader, SAMPFUNCS, or similar modifications, and any modification that provides an unfair advantage.',
        'Section 1.2 — Cheats, hacks, injectors, trainers, or any unauthorized third-party software will result in severe punishment, including a possible Permanent Ban.'
      ]
    },
    { type: 'article', number: 'ARTICLE 2', title: 'POWERGAMING', rules: [
      'Section 2.1 — Power Gaming is the use or abuse of game mechanics, systems, or unrealistic actions to gain an unfair advantage or create situations that would not reasonably happen in realistic roleplay.',
      'Section 2.2 — Players are required to prioritize realistic roleplay over game mechanics at all times.',
      'Section 2.3 — Abusing animations, vehicle mechanics, movement mechanics, or other game limitations to avoid RP consequences may be considered Power Gaming.'
    ]},
    { type: 'article', number: 'ARTICLE 3', title: 'BUG EXPLOITING', rules: [
      'Section 3.1 — Intentionally abusing bugs, glitches, or unintended game mechanics to gain an advantage is strictly prohibited.',
      'Section 3.2 — Players are required to report discovered bugs instead of exploiting them.',
      'Section 3.3 — Canceling animations or the use of /stopanim or /stuck to gain an unfair advantage is prohibited.',
      'Section 3.4 — Repeated or intentional exploitation of a bug may result in heavier sanctions depending on its impact.'
    ]},
    { type: 'article', number: 'ARTICLE 4', title: 'SEXUAL ROLEPLAY', rules: [
      'Section 4.1 — Sexual roleplay involving harassment, rape, sexual assault, or explicit sexual activity is strictly prohibited without clear consent.',
      'Section 4.2 — Explicit sexual emotes or descriptions are prohibited.',
      'Section 4.3 — Forcing another player into sexual favors or sexual scenarios is prohibited.',
      'Section 4.4 — Unwanted sexual advances, harassment, or inappropriate behavior may result in immediate punishment.'
    ]},
    { type: 'article', number: 'ARTICLE 5', title: 'OFFENSIVE ROLEPLAY', rules: [
      'Section 5.1 — Roleplay involving extreme torture, dismemberment, or other excessively disturbing scenarios may be considered Offensive Roleplay and may require staff intervention.',
      'Section 5.2 — Racial discrimination, prejudice, or degrading someone based on race is strictly prohibited.',
      'Section 5.3 — Homophobic or discriminatory slurs used to directly attack, insult, demean, or target a person or group are prohibited.',
      'Section 5.4 — Using discriminatory remarks to directly attack an individual based on identity, appearance, gender expression, or perceived sexuality may result in a Permanent Ban, depending on severity.',
      'Section 5.5 — Using discriminatory stereotypes or offensive remarks against someone indirectly may still result in punishment.',
      'Section 5.6 — Trash talk may be allowed when it remains within reasonable roleplay or competitive context. Using trash talk as an excuse for harassment, discrimination, or personal attacks is prohibited.',
      'Enforcement Guide — GTA Pinas Staff may consider the target of the statement, intent behind the statement, surrounding conversation, severity of language, previous violations, and overall impact on the community.'
    ]},
    { type: 'article', number: 'ARTICLE 6', title: 'BUSINESS RULES', rules: [
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
    ]},
    { type: 'article', number: 'ARTICLE 7', title: 'IMMUNITY', rules: [
      'Section 8.1 — Players may not rob a player with immunity, intentionally harm them, or force them into an RP situation that would result in robbery or unnecessary harm.',
      'Section 8.2 — Immunity becomes VOID if the player initiates violence, participates in criminal activities, intentionally provokes a hostile scenario, or becomes directly involved in an illegal activity.',
      'Section 8.3 — Immunity does not automatically protect a player from kidnapping or hostage RP, provided that their money and items are not taken.'
    ]},
    { type: 'article', number: 'ARTICLE 9', title: 'LOOTING / VULTURE', rules: [
      'Section 9.1 — EMS personnel who are actively on duty cannot be looted.',
      'Section 9.4 — Players not involved in an active gang-versus-gang war may not loot participants during the ongoing conflict.'
    ]},
    { type: 'article', number: 'ARTICLE 10', title: 'NEW CITIZEN', rules: [
      'Section 10.1 — New Citizens are still subject to all city rules and sanctions. Being new does not exempt anyone from punishment.',
      'Section 10.2 — Harming a New Citizen during their first day is prohibited unless the New Citizen initiates or becomes directly involved in a hostile scenario.'
    ]},
    { type: 'article', number: 'ARTICLE 11', title: 'COMBAT LOGGING', rules: [
      'Section 11.1 — Disconnecting from the server to avoid death, arrest, robbery, item loss, or RP consequences is strictly prohibited.',
      'Section 11.2 — Players who disconnect unintentionally must provide valid proof, such as screenshots, crash logs, or video evidence, when requested.',
      'Section 11.3 — Using Accept Death or any similar mechanic to avoid being looted or to escape RP consequences will be considered Combat Logging.'
    ]},
    { type: 'article', number: 'ARTICLE 12', title: 'BREAKING ROLEPLAY', rules: [
      'Section 12.1 — Players must remain in-character (IC) while participating in active roleplay.',
      'Section 12.2 — Players must allow an RP scenario to properly develop and conclude before filing a complaint whenever possible.',
      'Section 12.3 — Using OOC arguments to interrupt or manipulate an active RP scenario is prohibited.'
    ]},
    { type: 'article', number: 'ARTICLE 13', title: 'VEHICLE DEATHMATCH (VDM)', rules: [
      'Section 13.1 — Using a vehicle to intentionally hit, injure, or kill another player without valid RP reason is prohibited.',
      'Section 13.2 — Randomly running over players, intentionally ramming vehicles, or using vehicles as weapons without proper RP justification is considered VDM.',
      'Section 13.3 — If a legitimate vehicle accident causes injury or death, the driver must check on the affected player and properly continue the RP.'
    ]},
    { type: 'article', number: 'ARTICLE 14', title: 'RANDOM DEATHMATCH (RDM)', rules: [
      'Section 14.1 — RDM occurs when a player kills another player without a valid RP reason, proper interaction, or escalation.',
      'Section 14.2 — Shooting a player simply because they are nearby, without proper initiation or RP context, is considered RDM.',
      'Section 14.3 — If verbal interaction occurred but the situation was not properly escalated before gunplay, the incident may be classified as Low Quality Roleplay.'
    ]},
    { type: 'article', number: 'ARTICLE 15', title: 'METAGAMING', rules: [
      'Section 15.1 — Metagaming occurs when a player uses information their character could not realistically know. This includes information obtained from Discord, OOC chat, livestreams, screenshots, external communication, or other out-of-character sources.',
      'Section 15.2 — Players may only act on information their character legitimately knows within the roleplay environment.',
      'Section 15.3 — Recognizing a player by their appearance or known character identity is not automatically considered Metagaming.'
    ]},
    { type: 'article', number: 'ARTICLE 16', title: 'REPORT & PROOF POLICY', rules: [
      'Section 16.1 — All reports must contain sufficient and valid evidence.',
      'Section 16.2 — Screenshots, video clips, logs, or other approved evidence may be required depending on the report.',
      'Section 16.3 — Reports submitted without sufficient proof may be denied.',
      'Section 16.4 — Players involved in a report must provide their correct in-game name and Discord identity when requested by Management.',
      'Section 16.5 — False reports, manipulated evidence, or intentionally misleading information may result in sanctions against the reporter.',
      'Section 16.6 — Management reserves the right to review additional evidence before issuing a final decision.'
    ]},
    { type: 'article', number: 'ARTICLE 17', title: 'NEW LIFE RULE (NLR)', rules: [
      'Section 17.1 — After dying and respawning, your character is considered to have started a New Life.',
      'Section 17.2 — After death, your character must forget the identity of the attacker, the location of the incident, the circumstances surrounding the death, and information learned immediately before death.',
      'Section 17.3 — After respawning, players may not return to the death location for revenge, relay information about their death to others IC, or continue the same conflict without new RP.'
    ]},
    { type: 'article', number: 'ARTICLE 18', title: 'CONTINUOUS ROLEPLAY', rules: [
      'Section 18.1 — An RP scenario does not automatically end after a shootout, death, revive, or arrest.',
      'Section 18.2 — RP may continue logically after medical treatment or revival.',
      'Section 18.3 — Players must properly conclude the scenario before leaving, disengaging, or filing a report.',
      'Section 18.4 — Players should follow a natural RP conclusion such as arrest, escape, custody, Code 4, or Admin intervention.'
    ]},
    { type: 'article', number: 'ARTICLE 19', title: 'EVADING ROLEPLAY', rules: [
      'Section 19.1 — Intentionally avoiding, ignoring, or leaving an active RP scenario without a valid reason is prohibited.',
      'Section 19.2 — Actions performed specifically to avoid consequences, interaction, arrest, robbery, or conflict may be considered RP Evading.'
    ]},
    { type: 'article', number: 'ARTICLE 20', title: 'AFK RULES', rules: [
      'Section 20.1 — Players may not remain AFK during active RP, engagements, or critical situations.',
      'Section 20.2 — Players who need to go AFK must place their character in a safe location and ensure they are not involved in an active RP scenario.',
      'Section 20.3 — Intentional AFK to avoid RP consequences is considered RP Evading.',
      'Section 20.4 — Players are responsible for their character while AFK. Death or item loss caused by personal negligence may not be recoverable.',
      'Section 20.5 — Being inside a Safe Zone does not excuse negligence or inactivity.'
    ]},
    { type: 'article', number: 'ARTICLE 21', title: 'REVENGE ROLEPLAY', rules: [
      'Section 21.1 — Revenge must be based on a valid IC incident such as betrayal, scam, attack, or another legitimate RP conflict.',
      'Section 21.2 — Proper build-up and story progression are required before revenge.',
      'Section 21.3 — Instant revenge without proper RP progression may be considered Fail RP or RDM.',
      'Section 21.4 — Revenge must only target the individual or group directly involved in the original incident.',
      'Section 21.6 — Unrelated players may not be dragged into revenge RP unless they willingly participate.',
      'Section 21.7 — Players must allow the opposing party a reasonable opportunity to respond or react.',
      'Section 21.8 — Players may not force an outcome or immediately shoot another player without proper escalation.',
      'Section 21.9 — Repeated revenge scenarios against the same player may be subject to a cooldown or staff intervention.',
      'Section 21.10 — Revenge RP must be based strictly on IC information.'
    ]},
    { type: 'article', number: 'ARTICLE 23', title: 'ROLEPLAY BAITING', rules: [
      'Section 23.1 — Intentionally provoking or harassing another player solely to force gunplay, conflict, or a rule violation is prohibited.',
      'Section 23.2 — Repeatedly insulting or provoking players or groups without valid RP reason may be considered RP Baiting.',
      'Section 23.3 — Constantly following, blocking, interfering with, or provoking another player to force a confrontation is prohibited.',
      'Section 23.5 — Intentionally entering, approaching, or repeatedly running around the outside of an active war or conflict zone to provoke players inside the zone into shooting at you is considered RP Baiting, especially when there is no valid roleplay reason for doing so.'
    ]},
    {
      type: 'heading',
      title: 'CITY CODE NO. 1 — DISCORD RULES',
      intro: 'These rules apply to the GTA Pinas Discord community and are part of the overall server ruleset.'
    },
    { type: 'article', number: 'SECTION 1.1', title: 'Respect & Trash Talk', rules: [
      'Trash talk is fine in the spirit of the game, but any form of discrimination, hate speech, toxic behavior, or harassment will not be tolerated and may result in punishment.'
    ]},
    { type: 'article', number: 'SECTION 2.1', title: 'NSFW, Suspicious Links & Viruses', rules: [
      'Posting or spamming any +18 content (NSFW or nudity), suspicious links/downloads, and potential virus content is not allowed.'
    ]},
    { type: 'article', number: 'SECTION 3.1', title: 'Personal Information', rules: [
      'Distribution of personal information, including OOC name, address, pictures, or similar information, is strictly prohibited.'
    ]},
    { type: 'article', number: 'SECTION 4.1', title: 'Staff & Management Disrespect', rules: [
      'Any form of disrespect or threat made toward GTA Pinas Staff and its Management will result in a permanent ban from this server.'
    ]},
    {
      type: 'heading',
      title: 'POINT WAR RULES',
      intro: 'Point War is treated as an OOC competitive event while the event is active.'
    },
    { type: 'article', number: 'POINT WAR 1', title: 'OOC Competitive Event', rules: [
      'Point War is treated as an OOC competitive event. Participants are not required to maintain IC continuity while actively participating in the Point War.'
    ]},
    { type: 'article', number: 'POINT WAR 2', title: 'Unlimited Returns', rules: [
      'Players who are killed during an active Point War may return to the Point War area unlimited times until the Point War is officially declared finished by the authorized organizer or staff.'
    ]},
    { type: 'article', number: 'POINT WAR 3', title: 'Scope of the Return Rule', rules: [
      'The unlimited return rule applies only to the active Point War and does not extend to unrelated RP scenarios outside the Point War.'
    ]},
    {
      type: 'notice',
      title: 'FINAL NOTICE',
      rules: [
        'GTA Pinas Roleplay Management reserves the right to interpret, enforce, and update these rules when necessary to maintain fair, realistic, and enjoyable roleplay for everyone.',
        'All citizens are expected to use common sense, respect other players, and prioritize quality roleplay at all times.',
        'Failure to follow these rules may result in Warning, Community Service, Jail, Kick, Temporary Ban, or Permanent Ban depending on the severity and circumstances.',
        'All rules must be followed as stated. Ignorance of the rules is not an excuse. Exploiting loopholes or intentionally bending the rules for personal advantage is strictly prohibited. No one is above the law.'
      ]
    }
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
    if (document.getElementById('gta-city-rules-full-styles')) return;
    const style = document.createElement('style');
    style.id = 'gta-city-rules-full-styles';
    style.textContent = `
      #nav-city-rules { order: 1; }
      #nav-city-rules .city-rules-icon { width:16px; height:16px; flex:0 0 16px; }
      #view-city-rules { padding-bottom:48px; }
      .city-rules-shell { max-width:1100px; margin:0 auto; }
      .city-rules-intro { margin-bottom:22px; }
      .city-rules-toolbar { display:flex; gap:10px; margin:18px 0 24px; align-items:center; flex-wrap:wrap; }
      .city-rules-toolbar input { flex:1 1 320px; min-width:220px; background:var(--bg-card); color:var(--text-main); border:1px solid var(--border); border-radius:9px; padding:11px 13px; outline:none; font-size:13px; }
      .city-rules-toolbar button { background:var(--bg-card); color:var(--text-main); border:1px solid var(--border); border-radius:9px; padding:10px 13px; cursor:pointer; }
      .city-rules-meta { color:var(--text-sec); font-size:12px; margin-left:auto; }
      .city-rules-block { margin:0 0 26px; }
      .city-rules-block-heading { padding:0 2px 10px; border-bottom:1px solid var(--border); margin-bottom:10px; }
      .city-rules-block-heading h2 { font-size:18px; margin:0 0 5px; }
      .city-rules-block-heading p { font-size:13px; margin:0; }
      .city-rules-article { background:var(--bg-card); border:1px solid var(--border); border-radius:10px; margin:9px 0; overflow:hidden; }
      .city-rules-article-head { padding:13px 16px; display:flex; gap:14px; align-items:flex-start; }
      .city-rules-article-number { color:var(--primary); font-size:10px; font-weight:800; letter-spacing:.09em; min-width:92px; }
      .city-rules-article-title { font-size:14px; font-weight:650; }
      .city-rules-rules { border-top:1px solid var(--border); padding:8px 16px 13px 36px; margin:0; }
      .city-rules-rules li { color:var(--text-sec); font-size:13px; line-height:1.65; margin:7px 0; }
      .city-rules-rules li::marker { color:var(--primary); }
      .city-rules-notice { background:linear-gradient(145deg,rgba(88,101,242,.09),rgba(17,17,19,.92)); border:1px solid rgba(88,101,242,.26); border-radius:12px; padding:18px; margin-top:28px; }
      .city-rules-notice h2 { font-size:16px; margin:0 0 10px; }
      .city-rules-notice p { color:var(--text-sec); font-size:13px; line-height:1.65; margin:7px 0; }
      .city-rules-empty { display:none; padding:25px; text-align:center; color:var(--text-sec); border:1px dashed var(--border); border-radius:10px; }
      @media (max-width:760px) { .city-rules-article-head{display:block}.city-rules-article-number{margin-bottom:4px}.city-rules-meta{width:100%;margin-left:0}.city-rules-rules{padding-left:30px} }
    `;
    document.head.appendChild(style);
  }

  function renderRules(query = '') {
    const root = document.getElementById('city-rules-content');
    const meta = document.getElementById('city-rules-meta');
    const empty = document.getElementById('city-rules-empty');
    if (!root) return;

    const normalized = String(query || '').trim().toLowerCase();
    let visibleArticles = 0;
    let html = '';

    RULE_SECTIONS.forEach((section) => {
      if (section.type === 'heading') {
        html += `<section class="city-rules-block"><div class="city-rules-block-heading"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.intro)}</p></div>`;
        html += '<div class="city-rules-section-articles">';
        return;
      }
      if (section.type === 'article') {
        const haystack = [section.number, section.title, ...(section.rules || [])].join(' ').toLowerCase();
        const match = !normalized || haystack.includes(normalized);
        if (!match) return;
        visibleArticles += 1;
        html += `<article class="city-rules-article"><div class="city-rules-article-head"><div class="city-rules-article-number">${escapeHtml(section.number)}</div><div class="city-rules-article-title">${escapeHtml(section.title)}</div></div><ul class="city-rules-rules">`;
        html += (section.rules || []).map(rule => `<li>${escapeHtml(rule)}</li>`).join('');
        html += '</ul></article>';
        return;
      }
      if (section.type === 'notice') {
        html += `<section class="city-rules-notice"><h2>${escapeHtml(section.title)}</h2>${(section.rules || []).map(rule => `<p>${escapeHtml(rule)}</p>`).join('')}</section>`;
      }
    });

    root.innerHTML = html;
    if (meta) meta.textContent = `${visibleArticles} rule sections shown`;
    if (empty) empty.style.display = visibleArticles ? 'none' : 'block';
  }

  function ensureNavigation() {
    const navLinks = document.querySelector('.nav-links');
    const contentArea = document.querySelector('.content-area');
    if (!navLinks || !contentArea) return false;

    document.getElementById('nav-city-rules')?.remove();
    document.getElementById('view-city-rules')?.remove();

    const nav = document.createElement('div');
    nav.id = 'nav-city-rules';
    nav.className = 'nav-item';
    nav.dataset.target = 'view-city-rules';
    nav.innerHTML = `<i data-lucide="gavel" class="city-rules-icon"></i><span>City Rules</span>`;
    navLinks.appendChild(nav);

    const view = document.createElement('section');
    view.id = 'view-city-rules';
    view.className = 'view-section';
    view.innerHTML = `
      <div class="city-rules-shell">
        <div class="page-header"><div><h1>City Rules</h1><p class="city-rules-intro">GTA Pinas Roleplay — Complete City Rules, Discord Rules, and Point War Rules.</p></div></div>
        <div class="city-rules-toolbar">
          <input id="city-rules-search" type="search" placeholder="Search all rules..." autocomplete="off">
          <button type="button" id="city-rules-expand">Expand all</button>
          <span id="city-rules-meta" class="city-rules-meta"></span>
        </div>
        <div id="city-rules-content"></div>
        <div id="city-rules-empty" class="city-rules-empty">No rule matched your search.</div>
      </div>`;
    contentArea.appendChild(view);

    const showView = () => {
      document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      view.classList.add('active');
      nav.classList.add('active');
      renderRules(document.getElementById('city-rules-search')?.value || '');
    };

    nav.addEventListener('click', showView);
    document.getElementById('city-rules-search').addEventListener('input', (event) => renderRules(event.target.value));
    document.getElementById('city-rules-expand').addEventListener('click', () => {
      const query = document.getElementById('city-rules-search')?.value || '';
      const sections = Array.from(document.querySelectorAll('#city-rules-content .city-rules-article'));
      sections.forEach(article => article.style.display = 'block');
      renderRules(query);
    });

    renderRules();
    return true;
  }

  function init() {
    installStyles();
    if (!ensureNavigation()) return;
    window.renderPanelIcons?.({ immediate: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
