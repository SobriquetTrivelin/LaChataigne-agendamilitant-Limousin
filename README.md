# 🌰 La Châtaigne — agenda militant Limousin

> l'Agenda militant Limousin qui ne manque pas de piquants !

Une petite appli web (PWA) **sans serveur, sans base de données, sans pistage** :

* une page installable sur téléphone (hors-ligne), avec recherche, filtres par département et par type,
« ajouter à mon agenda » pour chaque événement, partage, affiches ;
* un calendrier **`agenda.ics`** auquel on s'abonne une fois (il se met à jour tout seul) ;
* un seul fichier de données, **`docs/data/evenements.json`**, que l'on édite chaque mois.

Pas de carte, pas de comptes, pas de formulaire en ligne : les propositions d'événements passent par un mail
(adresse à renseigner dans `docs/data/config.json`).

## Contenu du dépôt

```
docs/                     ← le site publié (GitHub Pages / Framagit Pages)
  index.html, style.css, app.js, ics.js, sw.js, manifest.webmanifest
  agenda.ics              ← généré (ne pas éditer à la main)
  data/evenements.json    ← LES DONNÉES : le seul fichier à éditer chaque mois
  data/config.json        ← adresse mail de contact et lien du dépôt
  affiches/               ← affiches en JPEG léger
  icons/                  ← logo châtaigne, icônes de l'appli
tools/build.py            ← vérifie les données et génère agenda.ics
tools/affiche.py          ← prépare une affiche (redimensionne, convertit en JPEG)
.gitlab-ci.yml            ← publication Framagit Pages
```

Aucune dépendance pour le site. Python 3 suffit pour `tools/build.py` ; `tools/affiche.py` demande Pillow (`pip install pillow`).

## Essayer en local

```bash
python3 tools/build.py
python3 -m http.server -d docs 8000
# puis ouvrir http://localhost:8000
```

## Publier gratuitement

**GitHub Pages** : créer un dépôt, y pousser ce dossier, puis *Settings → Pages → Deploy from a branch →
branche `main`, dossier `/docs`*. Le site apparaît à `https://<compte>.github.io/<depot>/`.

**Framagit Pages** (GitLab de Framasoft) : créer un projet sur [https://framagit.org](https://framagit.org), y pousser ce dossier.
Le fichier `.gitlab-ci.yml` publie `docs/` à chaque envoi sur la branche principale (voir la documentation
Framagit pour l'adresse du site, de type `https://<compte>.frama.io/<projet>/`).

Une fois le site en ligne, l'abonnement calendrier est : `https://…/agenda.ics`
(sur téléphone : « 📅 S'abonner au calendrier » en bas de la page).

## ✍️ Le processus de mise à jour mensuel

1. **Rassembler** le nouvel agenda (texte) et les affiches des événements.
2. **Affiches** : pour chacune, `python3 tools/affiche.py chemin/affiche.png nom-court`
(crée `docs/affiches/nom-court.jpg`, \~100 Ko).
3. **Événements** : ajouter les nouveaux dans `docs/data/evenements.json` (voir format ci-dessous).
Un événement = une date, un lieu. Un événement sur plusieurs jours ou plusieurs villes = plusieurs entrées.
Mettre à jour `"maj"` (date du jour) en haut du fichier.
4. **Vérifier et générer** : `python3 tools/build.py`. Le script signale les erreurs (date mal écrite, affiche
introuvable, type inconnu…), génère `docs/agenda.ics` et change la version du cache hors-ligne afin que les
téléphones récupèrent la nouvelle édition.
5. **Tester** en local (voir plus haut), puis `git add -A \&\& git commit -m "Édition de décembre" \&\& git push`.
Le site est à jour en une ou deux minutes ; les abonné·es au calendrier reçoivent les nouveautés d'eux-mêmes.

Les événements passés sont masqués par défaut mais restent consultables (case « Afficher les événements
passés »). On peut garder l'historique dans le fichier, ou retirer les anciens mois quand il devient long.

### Format d'un événement

```json
{
  "id": "2026-12-05-tulle-nom-court",
  "date": "2026-12-05",
  "debut": "20:30",
  "fin": "22:30",
  "titre": "Projection-débat : « Titre »",
  "type": "projection",
  "lieu": "Salle des fêtes",
  "ville": "Tulle",
  "departement": "19",
  "organisateur": "Collectif X",
  "description": "Texte libre. Une ligne vide sépare les paragraphes.",
  "programme": \[{ "h": "19h", "t": "Repas" }, { "h": "20h30", "t": "Film" }],
  "infos": \["Prix libre", "Apporte ton gobelet"],
  "contact": "contact@exemple.org",
  "lien": { "url": "https://exemple.org", "texte": "exemple.org" },
  "affiches": \["affiches/nom-court.jpg"],
  "tags": \["cinéma", "écologie"],
  "a\_confirmer": "Salle à confirmer"
}
```

|Champ|Obligatoire|Remarques|
|-|-|-|
|`id`|oui|unique et **stable** (c'est l'identifiant dans les calendriers : ne pas le changer si l'événement est modifié)|
|`date`|oui|`AAAA-MM-JJ`|
|`debut`, `fin`|non|`HH:MM`. Sans `debut` : événement « journée entière ». `fin` plus petite que `debut` = le lendemain (soirée finissant à 2 h). Sans `fin` : 2 h par défaut dans le calendrier|
|`titre`, `type`|oui|`type` ∈ `manif`, `projection`, `rencontre`, `soiree`, `atelier`, `permanence`, `festival` (modifiable dans `"types"`)|
|`lieu`, `ville`|conseillé|`departement` : `19`, `23`, `87` ou vide|
|`description`, `programme`, `infos`, `contact`, `lien`, `organisateur`, `tags`|non|affichés dans « Détails » ; `tags` alimente la recherche|
|`affiches`|non|chemins relatifs à `docs/`|
|`a\_confirmer`|non|affiche un encadré ⚠ « À confirmer » (lieu, horaire…) ; à retirer une fois l'info confirmée|

Le fichier `docs/data/evenements.schema.json` décrit ce format (autocomplétion dans VS Code et autres éditeurs).

### Texte-guide pour convertir un agenda avec un assistant IA (mais à éviter de préférence parce que bon l'IA…)

> Voici l'agenda militant de \[mois année] (texte joint) et les affiches. Convertis chaque événement en objet JSON
> au format de `docs/data/evenements.json` (champs : id, date, debut, fin, titre, type, lieu, ville, departement,
> organisateur, description, programme, infos, contact, lien, affiches, tags, a\_confirmer). Règles : un objet par date
> et par lieu ; heures en `HH:MM` ; n'invente rien (laisse vide ou utilise `a\_confirmer` si une info manque) ;
> reprends fidèlement les textes ; ids stables du type `AAAA-MM-JJ-ville-mots-cles`.

Relire toujours le résultat, puis `python3 tools/build.py`.

## Réglages

`docs/data/config.json` :

```json
{ "contact\_email": "agenda@exemple.org", "depot\_url": "https://framagit.org/…" }
```

`contact\_email` active le lien « Écris-nous par mail » (un mail pré-rempli pour signaler un événement).
Vide, le lien n'apparaît pas. `depot\_url` ajoute le lien « code source » en bas de page.

## Vie privée

Aucun cookie, aucun traceur, aucune statistique, aucune ressource externe : polices du système, icônes locales.
Les données restent dans le navigateur (cache hors-ligne).

## Licences

* **Code** : [GNU AGPL-3.0-or-later](LICENSE).
* **Données** (`evenements.json`, `agenda.ics`) : [CC BY-SA 4.0](LICENSE-DATA.md).
* **Affiches** : propriété de leurs auteur·ices (relayées pour promouvoir les événements).
* Logo châtaigne : dessin original du projet (AGPL-3.0-or-later).

Contributions bienvenues : tu peux forker le projet pour l'adapter à ton territoire (changer le titre, le
slogan, les départements et les couleurs dans `style.css`).

