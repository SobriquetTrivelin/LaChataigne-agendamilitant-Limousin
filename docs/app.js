/* La Châtaigne — agenda militant Limousin (PWA sans dépendance).
   Licence : AGPL-3.0-or-later. Données : data/evenements.json (CC BY-SA 4.0). */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  var fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  var fmtMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  var fmtMaj = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  var etat = { doc: null, types: new Set(), dep: '', q: '', passes: false, config: {} };

  function parseDate(iso) { var a = iso.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function aujourdhui() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function heure(t) { var a = t.split(':'); return Number(a[0]) + 'h' + (a[1] === '00' ? '' : a[1]); }
  function horaire(e) {
    if (!e.debut) return e.a_confirmer && /horaire/i.test(e.a_confirmer) ? 'Horaire à préciser' : 'Toute la journée';
    return e.fin ? heure(e.debut) + ' – ' + heure(e.fin) : heure(e.debut);
  }
  function lieuTexte(e) { return [e.lieu, e.ville].filter(Boolean).join(', '); }

  /* ---- petit utilitaire DOM (aucune injection de HTML) ---- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  /* texte avec adresses e-mail et liens cliquables */
  function lier(texte) {
    var frag = document.createDocumentFragment(), re = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s)]+)/g, i = 0, m;
    while ((m = re.exec(texte))) {
      if (m.index > i) frag.appendChild(document.createTextNode(texte.slice(i, m.index)));
      frag.appendChild(h('a', { href: m[1] ? 'mailto:' + m[1] : m[2], text: m[0] }));
      i = m.index + m[0].length;
    }
    if (i < texte.length) frag.appendChild(document.createTextNode(texte.slice(i)));
    return frag;
  }

  /* ---- filtres ---- */
  function visible(e, auj) {
    if (!etat.passes && e.date < auj) return false;
    if (etat.types.size && !etat.types.has(e.type)) return false;
    if (etat.dep && e.departement !== etat.dep) return false;
    if (etat.q) {
      var bloc = norm([e.titre, e.lieu, e.ville, e.organisateur, e.description, (e.tags || []).join(' '),
        (e.programme || []).map(function (p) { return p.t; }).join(' '), (etat.doc.types[e.type] || '')].join(' '));
      return norm(etat.q).split(/\s+/).filter(Boolean).every(function (mot) { return bloc.indexOf(mot) !== -1; });
    }
    return true;
  }

  /* ---- rendu ---- */
  function carte(e) {
    var ouverte = false;
    var detail = h('div', { class: 'detail', hidden: true, id: 'd-' + e.id });
    if (e.programme && e.programme.length) {
      detail.appendChild(h('h4', { text: 'Programme' }));
      detail.appendChild(h.apply(null, ['ul', { class: 'prog' }].concat(e.programme.map(function (p) {
        return h('li', { class: p.h ? '' : 'sans-h' }, p.h ? h('b', { text: p.h }) : null, h('span', null, lier(p.t)));
      }))));
    }
    if (e.infos && e.infos.length) {
      detail.appendChild(h('h4', { text: 'Infos pratiques' }));
      detail.appendChild(h.apply(null, ['ul', { class: 'infos' }].concat(e.infos.map(function (t) { return h('li', null, lier(t)); }))));
    }
    if (e.organisateur) detail.appendChild(h('p', { class: 'orga' }, h('b', { text: 'Organisé par : ' }), e.organisateur));
    if (e.contact) detail.appendChild(h('p', { class: 'orga' }, h('b', { text: 'Contact : ' }), lier(e.contact)));
    if (e.lien) detail.appendChild(h('p', { class: 'orga' }, h('a', { href: e.lien.url, rel: 'noopener', text: e.lien.texte || e.lien.url })));
    var affs = e.affiches || [];
    if (affs.length) {
      detail.appendChild(h.apply(null, ['div', { class: 'affiches' }].concat(affs.map(function (src, i) {
        return h('img', { src: src, alt: 'Affiche : ' + e.titre, loading: 'lazy', onclick: function () { ouvrirAffiches(e, i); } });
      }))));
    }
    var actions = h('div', { class: 'actions' },
      h('button', { class: 'btn btn-plein', type: 'button', onclick: function () { ajouterAgenda(e); } }, '📅 Ajouter à mon agenda'),
      h('button', { class: 'btn', type: 'button', onclick: function () { partager(e); } }, '↗ Partager'));
    detail.appendChild(actions);

    var paragraphes = (e.description || '').split(/\n\n+/).filter(Boolean).map(function (t) { return h('p', null, lier(t)); });
    var plus = h('button', { class: 'plus', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'd-' + e.id, text: 'Détails' + (affs.length ? ' et affiche' : '') });
    var art = h('article', { class: 'carte', id: e.id },
      h('h3', { text: e.titre }),
      h('p', { class: 'meta' }, [horaire(e), lieuTexte(e)].filter(Boolean).join(' · ')),
      affs.length ? h('button', { class: 'vignette', type: 'button', 'aria-label': 'Voir l’affiche : ' + e.titre, onclick: function () { ouvrirAffiches(e, 0); } },
        h('img', { src: affs[0], alt: '', loading: 'lazy' })) : null,
      h('div', { class: 'corps' },
        e.a_confirmer ? h('p', { class: 'alerte' }, '⚠ À confirmer : ' + e.a_confirmer) : null,
        h.apply(null, ['div', { class: 'desc' }].concat(paragraphes)),
        plus, detail));
    function basculer(force) {
      ouverte = typeof force === 'boolean' ? force : !ouverte;
      detail.hidden = !ouverte; art.classList.toggle('ouverte', ouverte);
      plus.setAttribute('aria-expanded', String(ouverte));
      plus.textContent = ouverte ? 'Réduire' : 'Détails' + (affs.length ? ' et affiche' : '');
    }
    plus.addEventListener('click', function () { basculer(); });
    art.basculer = basculer;
    return art;
  }

  function rendre() {
    var auj = aujourdhui(), liste = $('#liste');
    var evs = etat.doc.evenements.filter(function (e) { return visible(e, auj); });
    liste.textContent = '';
    $('#compte').textContent = evs.length + (evs.length > 1 ? ' événements' : ' événement') +
      (etat.passes ? '' : ' à venir') + (etat.types.size || etat.dep || etat.q ? ' (filtrés)' : '');
    if (!evs.length) {
      liste.appendChild(h('p', { class: 'vide' }, etat.doc.evenements.some(function (e) { return e.date >= auj; }) || etat.passes
        ? 'Aucun événement ne correspond à ces filtres.'
        : 'Plus d’événement à venir dans cette édition. La prochaine arrive bientôt ! Tu peux afficher les événements passés ci-dessus.'));
      return;
    }
    var moisPrec = '', jourPrec = '', section = null;
    evs.forEach(function (e) {
      var d = parseDate(e.date), mois = e.date.slice(0, 7);
      if (mois !== moisPrec) {
        var titre = fmtMois.format(d); liste.appendChild(h('h2', { class: 'mois-titre', text: titre })); moisPrec = mois;
      }
      if (e.date !== jourPrec) {
        var txt = fmtJour.format(d);
        section = h('section', { class: 'jour' + (e.date < auj ? ' passe' : '') },
          h('h2', null, txt.charAt(0).toUpperCase() + txt.slice(1), e.date === auj ? h('span', { class: 'auj', text: 'aujourd’hui' }) : null));
        liste.appendChild(section); jourPrec = e.date;
      }
      section.appendChild(carte(e));
    });
    ouvrirDepuisHash(false);
  }

  /* ouvre et fait défiler jusqu'à l'événement ciblé par le #id de l'adresse */
  function ouvrirDepuisHash(defiler) {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el && etat.doc.evenements.some(function (e) { return e.id === id; }) && !etat.passes) {
      etat.passes = true; $('#passes').checked = true; rendre(); return;
    }
    if (el && el.basculer) { el.basculer(true); if (defiler !== false) el.scrollIntoView({ block: 'start' }); }
  }

  /* ---- actions ---- */
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'evenement'; }
  function telecharger(nom, texte, mime) {
    var url = URL.createObjectURL(new Blob([texte], { type: mime }));
    var a = h('a', { href: url, download: nom }); document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function ajouterAgenda(e) {
    telecharger(slug(e.titre) + '.ics', window.ChataigneICS.creerICS([e], etat.doc.types), 'text/calendar;charset=utf-8');
  }
  function lienEvenement(e) { return location.href.split('#')[0] + '#' + e.id; }
  function partager(e) {
    var d = parseDate(e.date), txt = fmtJour.format(d) + ' · ' + horaire(e) + (lieuTexte(e) ? ' · ' + lieuTexte(e) : '');
    var data = { title: e.titre, text: e.titre + '\n' + txt, url: lienEvenement(e) };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    copier(data.text + '\n' + data.url, 'Texte et lien copiés');
  }
  function copier(texte, message) {
    var fin = function () { toast(message); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(fin, function () { window.prompt('Copie ce texte :', texte); });
    else window.prompt('Copie ce texte :', texte);
  }
  var timerToast;
  function toast(msg) {
    var t = $('#toast'); if (!t) { t = h('div', { id: 'toast', role: 'status', style: 'position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);background:#1a1a1a;color:#f2b705;padding:.6rem 1rem;border-radius:6px;font-weight:700;z-index:99' }); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(timerToast); timerToast = setTimeout(function () { t.hidden = true; }, 2500);
  }
  function ouvrirAffiches(e, debut) {
    var c = $('#visio-contenu'); c.textContent = '';
    (e.affiches || []).forEach(function (src) { c.appendChild(h('img', { src: src, alt: 'Affiche : ' + e.titre })); });
    var d = $('#visio'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    c.scrollTop = 0; var imgs = c.querySelectorAll('img'); if (imgs[debut] && debut) imgs[debut].scrollIntoView();
  }

  /* ---- abonnement .ics ---- */
  function urlICS() { return new URL('agenda.ics', location.href).href; }
  function initAbonnement() {
    var u = urlICS();
    $('#abo-webcal').href = u.replace(/^https?:/, 'webcal:');
    $('#abo-copie').addEventListener('click', function () { copier(u, 'Lien du calendrier copié'); });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) $('#aide-ios').hidden = false;
    var invite;
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault(); invite = ev; $('#installer').hidden = false;
    });
    $('#installer').addEventListener('click', function () {
      if (!invite) return; invite.prompt(); invite.userChoice.then(function () { invite = null; $('#installer').hidden = true; });
    });
  }

  /* ---- configuration facultative (data/config.json) ---- */
  function initConfig(c) {
    if (c.contact_email) {
      var sujet = encodeURIComponent('Événement à ajouter à La Châtaigne');
      var corps = encodeURIComponent('Titre :\nDate :\nHeure :\nLieu (adresse, ville) :\nDescription courte :\nLien :\nOrganisateur·ice :\n\n(Joins l’affiche si tu en as une.)');
      $('#proposer').href = 'mailto:' + c.contact_email + '?subject=' + sujet + '&body=' + corps;
      $('#proposer-p').hidden = false;
    }
    if (c.depot_url) { $('#depot').href = c.depot_url; $('#depot').hidden = false; }
  }

  /* ---- démarrage ---- */
  function chips() {
    var box = $('#chips'), types = etat.doc.types;
    var presents = new Set(etat.doc.evenements.map(function (e) { return e.type; }));
    Object.keys(types).filter(function (t) { return presents.has(t); }).forEach(function (t) {
      var b = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', text: types[t] });
      b.addEventListener('click', function () {
        if (etat.types.has(t)) etat.types.delete(t); else etat.types.add(t);
        b.setAttribute('aria-pressed', String(etat.types.has(t))); rendre();
      });
      box.appendChild(b);
    });
  }
  function demarrer(doc) {
    etat.doc = doc;
    if (doc.maj) $('#maj').textContent = 'Édition mise à jour le ' + fmtMaj.format(parseDate(doc.maj));
    chips();
    var minuteur;
    $('#q').addEventListener('input', function (ev) { clearTimeout(minuteur); minuteur = setTimeout(function () { etat.q = ev.target.value.trim(); rendre(); }, 150); });
    $('#dep').addEventListener('change', function (ev) { etat.dep = ev.target.value; rendre(); });
    $('#passes').addEventListener('change', function (ev) { etat.passes = ev.target.checked; rendre(); });
    $('#visio-fermer').addEventListener('click', function () { $('#visio').close(); });
    $('#visio').addEventListener('click', function (ev) { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
    window.addEventListener('hashchange', function () { ouvrirDepuisHash(true); });
    rendre(); ouvrirDepuisHash(true);
  }

  initAbonnement();
  fetch('data/config.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(initConfig);
  fetch('data/evenements.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(demarrer)
    .catch(function () {
      $('#liste').textContent = '';
      $('#liste').appendChild(h('p', { class: 'vide' }, 'Impossible de charger l’agenda. Vérifie ta connexion, ou ouvre le calendrier ', h('a', { href: 'agenda.ics', text: 'agenda.ics' }), '.'));
    });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
