# CHASSIS — Doctrine

Neuf principes. Le n°2 commande tous les autres.

1. **Chassis, pas IDE.** On ne construit pas une surface de travail. Un daemon branché
   sur les outils existants du métier + un cockpit de pilotage (file, verdicts, mémoire, courbe).

2. **Le harness est la seule porte.** Rien n'entre en mémoire, rien n'est appliqué, rien
   n'est facturé sans verdict machine. Implémenté dans `packages/core/harness.ts` et par
   contrainte `memory_requires_provenance` en base.

3. **Pas de preuve, pas de tâche.** L'unité de travail est l'intention avec son critère de
   vérification attaché. Sans critère → `out_of_scope`, rendu à l'humain. Le système ne bluffe jamais.

4. **Mémoire darwinienne.** Seules les sorties validées (verdict `passed`) ou les rejets réels
   (settlements) créent des jetons. Révocables, jamais réécrits. La mémoire compose au lieu de se dégrader.

5. **Ce qui évolue, c'est la couche molle.** Prompts, règles du harness, mémoire, politiques de
   routage — jamais le runtime. C'est l'auto-amélioration réellement constructible
   (réf. : system prompt learning, Karpathy), et elle suffit à tenir d(Système)/dt > d(Modèle)/dt.

6. **Modèles = commodité.** Moteurs interchangeables, routés par tâche/coût/latence
   (`packages/core/router.ts`). On survit à toutes les générations de modèles.

7. **Vertical par instance, horizontal par principe.** Le chassis ne se spécialise pas ;
   l'utilisateur instancie son domaine (vérité terrain + règles + outils). La première
   instance est opérée par nous : on prouve avant de généraliser.

8. **La courbe est le produit.** Taux de succès vérifié au premier envoi, avec vs sans mémoire,
   semaine après semaine. Aucune métrique fictive, nulle part, jamais.

9. **La preuve avant l'infrastructure.** Boucle complète sur un cas réel avant toute
   généralisation. Les abstractions s'extraient de l'usage, jamais l'inverse.

## Modèle économique

Facturation à l'**unité validée** — possible uniquement parce que le harness prouve chaque
unité. Ni licence par siège, ni facturation horaire. Offre pilote : « 50 dossiers historiques,
on ne facture que ce que le système valide ».

## Autonomie (autonomy slider)

`shadow` → `copilot` → `auto`, par **catégorie**, quand le taux vérifié dépasse le seuil
(défaut 98 %) sur la durée. Le harness reste la porte à tous les crans.

## Décisions de stack actées

- **TypeScript partout** (core, cockpit, site). Un langage, types partagés, itération maximale.
- **Rust / Python : rejetés pour la v0.1.** Critères de réouverture :
  vérification haut débit (>10k dossiers/min) → Rust ; embeddings/fine-tuning locaux sur le
  corpus validé (≥ 1 an de données) → service Python. Pas avant.
- Le seul Rust du repo est la coque Tauri (générée, aucune logique).
