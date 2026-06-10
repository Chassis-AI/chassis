# CHASSIS — Vision

> La doctrine ([DOCTRINE.md](DOCTRINE.md)) dit comment le système fonctionne.
> Ce document dit où il va. Aucun chiffre ici n'est une projection : quand une
> donnée n'existe pas encore, on écrit « à mesurer » (principe 8 — aucune
> métrique fictive, nulle part, jamais).

## Thèse — la couche de confiance du travail IA

Les modèles savent produire du travail spécialisé. Personne ne sait encore
**prouver** ce travail à l'échelle : le livrer avec un verdict machine, n'en
mémoriser que le validé, et le facturer uniquement quand il est juste. C'est
cette couche-là — pas les modèles, pas les agents, pas l'interface — qui
manque entre l'IA et l'économie réelle.

CHASSIS est cette couche. Trois conséquences structurent tout le reste :

1. **La confiance est le produit, le travail est le vecteur.** Un client
   n'achète pas « de l'IA qui fait la paie » ; il achète des dossiers dont le
   rejet ne reviendra pas. La courbe de taux de succès vérifié au premier
   envoi *est* l'argument commercial — elle se constate, elle ne se promet pas.

2. **La couche est horizontale, chaque conquête est verticale.** Le chassis
   (harness, mémoire darwinienne, boucle, routeur) ne se spécialise jamais.
   Ce qui se spécialise, c'est l'instance : vérité terrain + règles + outils
   d'un métier dans un pays. C'est le principe 7 transformé en stratégie
   d'expansion.

3. **Les modèles restent une commodité.** La valeur accumulée — mémoire
   validée, règles apprises, courbes par catégorie — appartient à la couche,
   pas au moteur. Chaque génération de modèles rend CHASSIS plus rentable,
   jamais obsolète (principe 6).

## Le critère d'entrée d'un vertical

Un vertical n'est candidat que s'il offre un **verdict institutionnel** :
une instance externe (administration, caisse, organisme payeur) qui accepte
ou rejette chaque dossier selon des règles publiées. Ce verdict est la vérité
terrain gratuite qui calibre le harness — sans lui, il faudrait construire la
vérité terrain nous-mêmes, et le principe 3 (« pas de preuve, pas de tâche »)
deviendrait un coût au lieu d'un avantage.

Critères, par ordre d'importance :

1. Verdict externe, binaire ou codifié (accepté / rejeté avec motif).
2. Volume récurrent de dossiers homogènes (le système apprend par catégorie).
3. Coût d'erreur élevé pour le client (pénalités, retards, redressements) —
   c'est ce qui rend la facturation à l'unité validée évidente.
4. Outils métier existants accessibles (le chassis se branche, principe 1).

Exemples de verticaux qui passent le filtre (liste de travail, pas un
engagement) : paie et déclarations sociales (rejets de l'organisme
collecteur), facturation de soins (rejets des caisses), déclarations
douanières, déclarations fiscales des cabinets comptables, gestion de
sinistres. Le premier pilote vise la **paie / rejets de déclarations** :
verdict institutionnel net, douleur récurrente, dossiers historiques
disponibles pour calibrer.

## La matrice verticaux × pays

L'unité de conquête n'est ni un vertical mondial, ni un pays entier :
c'est une **case** — un vertical dans un pays. Chaque case a sa vérité
terrain (règles locales, organisme local, format local) ; c'est précisément
pourquoi une case dominée est défendable : la mémoire validée et les règles
apprises d'une case ne s'improvisent pas, elles se gagnent dossier par
dossier.

```
                 FR        BE        CH        QC/CA     UE (autres)   US
paie/social      ACTE 1-2  acte 3    acte 3    acte 3    acte 3-4      acte 4
facturation soins    .     .         .         .         .             .
douane               .     .         .         .         .             .
fiscal/compta        .     .         .         .         .             .
sinistres            .     .         .         .         .             .
```

Deux lois de remplissage :

- **Verticalement** (même pays, nouveau métier) : on réutilise la langue, le
  droit, le réseau commercial. Coût d'entrée : nouvelle vérité terrain.
- **Horizontalement** (même métier, nouveau pays) : on réutilise les règles
  métier génériques et les catégories d'intentions. Coût d'entrée : nouvel
  organisme de verdict, nouveau format, nouvelle langue.

La couche (le chassis) est le seul actif présent dans toutes les cases. C'est
ce qui distingue CHASSIS d'un éditeur vertical : un concurrent peut nous
disputer une case, pas la matrice.

Le go-to-market démarre francophone (FR d'abord, puis BE/CH/QC qui
partagent la langue). Le **produit**, lui, est multilingue dès la v0.1
(fr/en/es/zh — décision actée 2026-06-10) : la couche est mondiale par
construction, ajouter une langue = ajouter un dictionnaire ; seule la
prospection reste séquencée par la matrice.

## La séquence — quatre actes

**Acte 1 — Le pilote prouvé.** Un client, un vertical, un pays. Offre :
« 50 dossiers historiques, on ne facture que ce que le système valide. »
Sortie d'acte : une courbe réelle (taux de succès vérifié au premier envoi,
avec vs sans mémoire) sur des dossiers réels, et un client qui paie à l'unité
validée. Tant que cette courbe n'existe pas, rien d'autre n'est prioritaire —
le goulot n°1 du projet est de trouver ce pilote, pas d'écrire du code.

**Acte 2 — La case dominée.** Même vertical, même pays, N clients. La mémoire
validée commence à composer entre clients d'une même catégorie (dans les
limites de la confidentialité de chaque instance). Sortie d'acte : l'autonomie
passe `shadow → copilot → auto` sur les catégories où le taux vérifié tient
au-dessus du seuil dans la durée, et l'économie unitaire est connue (coût de
production d'une unité validée vs prix — à mesurer, pas à projeter).

**Acte 3 — La matrice.** Expansion case par case selon les deux lois de
remplissage, dans l'ordre du retour sur vérité terrain : d'abord les cases
adjacentes (même pays ou même vertical), jamais une case isolée. Chaque
nouvelle case rejoue l'acte 1 en plus court — le chassis est déjà prouvé,
seule l'instance est nouvelle. C'est ici que l'i18n et l'anglais entrent.

**Acte 4 — La plateforme, puis le standard.** Quand assez de cases sont
dominées, le principe 7 s'inverse : des opérateurs tiers instancient leurs
propres verticaux sur notre couche (vérité terrain à eux, harness à nous).
La facturation à l'unité validée devient le standard de fait du travail IA
sérieux — et le verdict CHASSIS, la preuve que les assureurs, les clients et
les régulateurs exigent. La couche de confiance, au sens propre.

Chaque acte n'est ouvert que par la **preuve** de l'acte précédent (principe
9) : pas de matrice sans case dominée, pas de plateforme sans matrice.

## Ce que cette vision interdit

- Lever ou recruter pour l'acte 3 pendant l'acte 1.
- Démarrer une case sans verdict institutionnel accessible.
- Promettre une courbe au lieu de la montrer.
- Généraliser le chassis à partir de zéro cas réel.
