# Tests — Gestion Locative

Suite de tests unitaires sur les **fonctions de calcul** de `index.html`.
Zéro dépendance externe : Node.js 18+ et c'est tout.

## Lancer

```bash
cd "Generation Quittance"
node tests/run.js
```

Sortie attendue (quand tout passe) :

```
  43 OK  |  0 KO
```

Code de retour : `0` si tout passe, `1` s'il y a des échecs, `2` si le script de l'app n'a pas pu charger.

## Ce qui est couvert

- `getPeriodiciteLoyer`, `getTrimestresBail` — helpers de périodicité
- `getMontantsPeriode`, `getMoisTotal` — montants loyer + charges par mois (mensuel / trimestriel)
- `isBailActifPourMois` — activité du bail sur un mois donné
- `getCoutTotalAcquisition`, `getChargesAnnuelles` — agrégats comptables par bien
- `calcMensualiteCredit`, `calcCapitalRestant` — calculs de crédit
- `getLocataireInitials` — avatars (société, particulier, edge cases)
- `collectImpayes`, `collectImpayesParLocataire` — avec data + filtre propriétaire

## Ce qui n'est PAS couvert (pour l'instant)

- Rendu DOM (`renderDashboard`, `renderPaiements`, etc.) — c'est de l'affichage, on teste le calcul en amont.
- Génération PDF (`genQuittancePDF`) — dépend de jsPDF, à tester manuellement.
- Auth (Google OAuth + Firebase Email) — dépend de réseau et de librairies externes.
- Envoi email (Gmail API) — idem.

## Comment ça marche sous le capot

`tests/run.js` :

1. Lit `index.html`.
2. Extrait le contenu du `<script>` principal.
3. Préfixe 3 hooks qui exposent `data` et `filtreProprioId` au runner (ces variables sont déclarées en `let` dans le scope lexical du script, donc inaccessibles autrement).
4. Stub les globals navigateur minimalistes (`document`, `localStorage`, `addEventListener`, etc.) pour que l'init du script ne plante pas.
5. Exécute le script dans un `vm.Script` isolé.
6. Récupère les fonctions et les fait tourner contre des fixtures.

Les fixtures sont des objets plain JS construits dans `run.js` (pas de fichier séparé — pas besoin pour l'instant).

## Ajouter un test

Dans `tests/run.js`, trouve un `group('...', () => { ... })` existant, et ajoute un `test('...', () => { ... })` dedans. Ou crée un nouveau groupe.

Exemple :

```js
group('Mon nouveau bloc', () => {
  test('ma fonction retourne 42', () => {
    assert.strictEqual(app.maFonction(input), 42);
  });
});
```

Helpers dispo :

- `makeBail(overrides)` — fixture bail par défaut (mensuel, Actif, 2025-01-01)
- `approx(actual, expected, epsilon)` — comparaison flottante
- `deepEq(actual, expected)` — comparaison profonde cross-realm safe
- `assert.*` — assertions Node standard

## Quand lancer les tests

- **Avant chaque `./deploy.sh`** — ça prend 1 seconde, ça te dit si tu as cassé un calcul.
- **Après avoir modifié une fonction `isBailActifPourMois`, `getMontantsPeriode`, `collectImpayes`** ou tout ce qui touche aux montants.
- **Après une grosse refacto** — tu peux avoir des tests de non-régression qui tombent.

## Limites connues

- Les tests `collectImpayes` dépendent de `Date.now()` (année courante). Si tu exécutes en 2036 avec un plancher `IMPAYES_DEBUT_ANNEE = 2026`, tu remonteras beaucoup plus de mois qu'en 2026. Les asserts sont écrits pour passer dans les deux cas (`length >= 1`), pas un nombre exact.
- Les stubs DOM sont minimalistes. Si tu ajoutes une fonction qui manipule le DOM en amont du calcul, ajoute le stub correspondant dans `makeSandbox()` dans `run.js`.
- Pas de coverage report. Pour un vrai coverage, il faudrait switcher vers `c8` ou Jest — overkill pour l'instant.
