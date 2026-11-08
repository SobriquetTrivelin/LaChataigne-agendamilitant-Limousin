#!/usr/bin/env python3
"""
La Châtaigne — validation des données et génération de l'agenda .ics.

Usage :  python3 tools/build.py          (depuis la racine du dépôt)

Ce que fait ce script (aucune dépendance, Python 3.8+) :
  1. vérifie docs/data/evenements.json (champs, dates, heures, affiches présentes…) ;
  2. génère docs/agenda.ics (abonnement calendrier, iCalendar RFC 5545) ;
  3. met à jour la version du cache hors-ligne dans docs/sw.js pour que les
     téléphones récupèrent les nouveautés.

Licence : AGPL-3.0-or-later.
"""
import hashlib, json, re, sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DATA = DOCS / "data" / "evenements.json"
ICS = DOCS / "agenda.ics"
SW = DOCS / "sw.js"

DUREE_PAR_DEFAUT = timedelta(hours=2)   # si un événement n'a pas d'heure de fin
DEPARTEMENTS = {"", "19", "23", "87"}
UID_DOMAINE = "agenda-la-chataigne"
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def charger():
    with DATA.open(encoding="utf-8") as f:
        return json.load(f)


# ----------------------------------------------------------------- validation
def valider(doc):
    erreurs, alertes = [], []
    types = doc.get("types", {})
    ids = set()
    for i, e in enumerate(doc.get("evenements", [])):
        nom = f"#{i+1} {e.get('titre', '?')[:40]}"
        for champ in ("id", "date", "titre", "type"):
            if not e.get(champ):
                erreurs.append(f"{nom} : champ « {champ} » manquant")
        if e.get("id") in ids:
            erreurs.append(f"{nom} : id en double ({e['id']})")
        ids.add(e.get("id"))
        try:
            date.fromisoformat(e.get("date", ""))
        except ValueError:
            erreurs.append(f"{nom} : date invalide « {e.get('date')} » (format AAAA-MM-JJ)")
        for champ in ("debut", "fin"):
            v = e.get(champ)
            if v is not None and not TIME_RE.match(v):
                erreurs.append(f"{nom} : {champ} invalide « {v} » (format HH:MM)")
        if e.get("fin") and not e.get("debut"):
            erreurs.append(f"{nom} : une heure de fin sans heure de début")
        if e.get("type") not in types:
            erreurs.append(f"{nom} : type inconnu « {e.get('type')} » (types : {', '.join(types)})")
        if e.get("departement", "") not in DEPARTEMENTS:
            erreurs.append(f"{nom} : département « {e.get('departement')} » (attendu : 19, 23, 87 ou vide)")
        for a in e.get("affiches", []):
            if not (DOCS / a).is_file():
                erreurs.append(f"{nom} : affiche introuvable ({a})")
        if not e.get("ville"):
            alertes.append(f"{nom} : ville non renseignée")
        if not e.get("debut"):
            alertes.append(f"{nom} : pas d'heure → événement « journée entière » dans le calendrier")
    return erreurs, alertes


# ------------------------------------------------------------------------ ICS
def echapper(t):
    return (t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
             .replace("\r\n", "\n").replace("\n", "\\n"))


def plier(ligne):
    """Plie à 75 octets UTF-8 (RFC 5545 §3.1) sans couper un caractère."""
    out, cur, n = [], "", 0
    for ch in ligne:
        b = len(ch.encode("utf-8"))
        if n + b > (75 if not out else 74):
            out.append(cur); cur, n = "", 0
        cur += ch; n += b
    out.append(cur)
    return "\r\n ".join(out)


def texte_description(e, types):
    """Doit rester aligné avec descriptionTexte() dans docs/app.js."""
    p = []
    if e.get("description"): p.append(e["description"])
    if e.get("a_confirmer"): p.append("À confirmer : " + e["a_confirmer"])
    if e.get("programme"):
        p.append("Programme :\n" + "\n".join(
            "- " + ((x["h"] + " : ") if x.get("h") else "") + x["t"] for x in e["programme"]))
    if e.get("infos"):
        p.append("Infos pratiques :\n" + "\n".join("- " + x for x in e["infos"]))
    if e.get("organisateur"): p.append("Organisé par : " + e["organisateur"])
    if e.get("contact"): p.append("Contact : " + e["contact"])
    if e.get("lien"): p.append("Lien : " + e["lien"]["url"])
    return "\n\n".join(p)


def vevent(e, types, stamp):
    d = date.fromisoformat(e["date"])
    L = ["BEGIN:VEVENT", f"UID:{e['id']}@{UID_DOMAINE}", f"DTSTAMP:{stamp}", f"LAST-MODIFIED:{stamp}"]
    if e.get("debut"):
        h, m = map(int, e["debut"].split(":"))
        debut = datetime(d.year, d.month, d.day, h, m)
        if e.get("fin"):
            h2, m2 = map(int, e["fin"].split(":"))
            fin = datetime(d.year, d.month, d.day, h2, m2)
            if fin <= debut:
                fin += timedelta(days=1)          # ex. soirée qui finit à 2h du matin
        else:
            fin = debut + DUREE_PAR_DEFAUT
        L += [f"DTSTART;TZID=Europe/Paris:{debut:%Y%m%dT%H%M%S}", f"DTEND;TZID=Europe/Paris:{fin:%Y%m%dT%H%M%S}"]
    else:
        L += [f"DTSTART;VALUE=DATE:{d:%Y%m%d}", f"DTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}"]
    L.append("SUMMARY:" + echapper(e["titre"]))
    lieu = ", ".join(x for x in (e.get("lieu"), e.get("ville")) if x)
    if lieu: L.append("LOCATION:" + echapper(lieu))
    desc = texte_description(e, types)
    if desc: L.append("DESCRIPTION:" + echapper(desc))
    if e.get("lien"): L.append("URL:" + e["lien"]["url"])
    L.append("CATEGORIES:" + echapper(types.get(e["type"], e["type"])))
    L.append("END:VEVENT")
    return L


VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE""".split("\n")


def generer_ics(doc):
    types = doc["types"]
    stamp = doc.get("maj", date.today().isoformat()).replace("-", "") + "T000000Z"
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//La Châtaigne//Agenda militant Limousin//FR",
         "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
         "X-WR-CALNAME:" + echapper(f"{doc['titre']} · agenda militant Limousin"),
         "X-WR-CALDESC:" + echapper(doc.get("slogan", "")), "X-WR-TIMEZONE:Europe/Paris",
         "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"] + VTIMEZONE
    for e in doc["evenements"]:
        L += vevent(e, types, stamp)
    L.append("END:VCALENDAR")
    return "\r\n".join(plier(l) for l in L) + "\r\n"


# -------------------------------------------------------------- cache hors-ligne
def maj_version_sw():
    h = hashlib.sha1()
    for p in (DATA, DOCS / "index.html", DOCS / "app.js", DOCS / "style.css", DOCS / "manifest.webmanifest"):
        if p.is_file(): h.update(p.read_bytes())
    v = h.hexdigest()[:10]
    src = SW.read_text(encoding="utf-8")
    nouveau = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{v}';", src)
    if nouveau != src: SW.write_text(nouveau, encoding="utf-8")
    return v


def main():
    doc = charger()
    erreurs, alertes = valider(doc)
    for a in alertes: print("  attention :", a)
    if erreurs:
        print("\nERREURS (rien n'a été généré) :")
        for e in erreurs: print("  ✗", e)
        sys.exit(1)
    ICS.write_bytes(generer_ics(doc).encode("utf-8"))
    v = maj_version_sw()
    n = len(doc["evenements"])
    jours = sorted({e["date"] for e in doc["evenements"]})
    print(f"✓ {n} événements du {jours[0]} au {jours[-1]}")
    print(f"✓ {ICS.relative_to(ROOT)} généré · cache hors-ligne version {v}")


if __name__ == "__main__":
    main()
