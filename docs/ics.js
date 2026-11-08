/* La Châtaigne — génération iCalendar côté navigateur (bouton « Ajouter à mon agenda »).
   Doit rester aligné avec tools/build.py (qui produit agenda.ics). Licence : AGPL-3.0-or-later. */
(function (root) {
  'use strict';
  var DUREE_DEFAUT_MIN = 120;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  function echapper(t) {
    return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function octets(ch) { return unescape(encodeURIComponent(ch)).length; }
  function plier(ligne) {
    var out = [], cur = '', n = 0;
    Array.from(ligne).forEach(function (ch) {
      var b = octets(ch);
      if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
      cur += ch; n += b;
    });
    out.push(cur);
    return out.join('\r\n ');
  }
  function descriptionTexte(e) {
    var p = [];
    if (e.description) p.push(e.description);
    if (e.a_confirmer) p.push('À confirmer : ' + e.a_confirmer);
    if (e.programme && e.programme.length)
      p.push('Programme :\n' + e.programme.map(function (x) { return '- ' + (x.h ? x.h + ' : ' : '') + x.t; }).join('\n'));
    if (e.infos && e.infos.length) p.push('Infos pratiques :\n' + e.infos.map(function (x) { return '- ' + x; }).join('\n'));
    if (e.organisateur) p.push('Organisé par : ' + e.organisateur);
    if (e.contact) p.push('Contact : ' + e.contact);
    if (e.lien) p.push('Lien : ' + e.lien.url);
    return p.join('\n\n');
  }
  function ymdhms(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function vevent(e, types, stamp) {
    var a = e.date.split('-').map(Number), y = a[0], m = a[1] - 1, j = a[2];
    var L = ['BEGIN:VEVENT', 'UID:' + e.id + '@agenda-la-chataigne', 'DTSTAMP:' + stamp, 'LAST-MODIFIED:' + stamp];
    if (e.debut) {
      var hm = e.debut.split(':').map(Number);
      var d1 = new Date(y, m, j, hm[0], hm[1]);
      var d2;
      if (e.fin) {
        var hf = e.fin.split(':').map(Number);
        d2 = new Date(y, m, j, hf[0], hf[1]);
        if (d2 <= d1) d2 = new Date(y, m, j + 1, hf[0], hf[1]);
      } else {
        d2 = new Date(y, m, j, hm[0], hm[1] + DUREE_DEFAUT_MIN);
      }
      L.push('DTSTART;TZID=Europe/Paris:' + ymdhms(d1), 'DTEND;TZID=Europe/Paris:' + ymdhms(d2));
    } else {
      var f = new Date(y, m, j + 1);
      L.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''),
             'DTEND;VALUE=DATE:' + f.getFullYear() + pad(f.getMonth() + 1) + pad(f.getDate()));
    }
    L.push('SUMMARY:' + echapper(e.titre));
    var lieu = [e.lieu, e.ville].filter(Boolean).join(', ');
    if (lieu) L.push('LOCATION:' + echapper(lieu));
    var desc = descriptionTexte(e);
    if (desc) L.push('DESCRIPTION:' + echapper(desc));
    if (e.lien) L.push('URL:' + e.lien.url);
    L.push('CATEGORIES:' + echapper((types && types[e.type]) || e.type));
    L.push('END:VEVENT');
    return L;
  }
  var VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE'];

  /** Renvoie le texte d'un fichier .ics contenant un ou plusieurs événements. */
  function creerICS(evenements, types, stampISO) {
    var stamp = (stampISO || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/^(\d{8}T\d{6}).*$/, '$1Z');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//La Châtaigne//Agenda militant Limousin//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'].concat(VTZ);
    evenements.forEach(function (e) { L = L.concat(vevent(e, types, stamp)); });
    L.push('END:VCALENDAR');
    return L.map(plier).join('\r\n') + '\r\n';
  }

  var api = { creerICS: creerICS, descriptionTexte: descriptionTexte };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChataigneICS = api;
})(typeof window !== 'undefined' ? window : this);
