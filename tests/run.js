#!/usr/bin/env node
/**
 * Suite de tests pour les fonctions de calcul de Gestion Locative.
 *
 * Usage :
 *   node tests/run.js
 *
 * Fonctionnement :
 *   1. Lit index.html
 *   2. Extrait le <script> principal (le dernier bloc, avant </body>)
 *   3. Stub les globals navigateur (document, window, localStorage, etc.)
 *   4. Exécute le script dans un sandbox vm.Script
 *   5. Récupère les fonctions exposées (getMontantsPeriode, etc.) et les teste
 *
 * Philosophie :
 *   - Aucune dépendance externe (node built-in uniquement).
 *   - Chaque test est une fonction simple. Échec = throw. Succès = return.
 *   - On ne teste QUE les fonctions de calcul pures ou quasi-pures
 *     (pas de DOM, pas de fetch, pas de PDF).
 *
 * Pour ajouter un test :
 *   - Ajouter une fonction dans tests/cases.js
 *   - Elle sera auto-découverte ici.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

// ── 1. Extraire le <script> principal de index.html ────────────────────────

function extractScript(html) {
  // Le dernier <script>...</script> juste avant </body> est le gros bloc inline.
  // Les <script src=...> des CDN n'ont pas de contenu, ils ne matchent pas.
  const re = /<script>([\s\S]*?)<\/script>\s*<\/body>/i;
  const m = html.match(re);
  if (!m) throw new Error('Impossible de trouver le <script> principal dans index.html');
  return m[1];
}

// ── 2. Préparer le sandbox avec des stubs navigateur ───────────────────────

function makeSandbox() {
  // Stubs minimaux pour que le script charge sans crasher.
  // Tout ce qui touche au DOM devient un no-op.
  const noop = () => {};
  const fakeEl = new Proxy({}, {
    get: (t, k) => {
      if (k === 'classList') return { add: noop, remove: noop, contains: () => false, toggle: noop };
      if (k === 'style') return new Proxy({}, { get: () => '', set: () => true });
      if (k === 'children' || k === 'childNodes') return [];
      if (k === 'appendChild' || k === 'removeChild' || k === 'setAttribute' || k === 'addEventListener' || k === 'removeEventListener' || k === 'click' || k === 'focus' || k === 'blur' || k === 'scrollIntoView') return noop;
      if (k === 'getBoundingClientRect') return () => ({ top: 0, left: 0, width: 0, height: 0 });
      if (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'innerText') return '';
      if (k === 'dataset') return {};
      if (typeof k === 'string' && k.startsWith('__')) return undefined;
      return fakeEl;
    },
    set: () => true
  });

  const document = {
    getElementById: () => fakeEl,
    querySelector: () => fakeEl,
    querySelectorAll: () => [],
    createElement: () => fakeEl,
    addEventListener: noop,
    removeEventListener: noop,
    body: fakeEl,
    documentElement: fakeEl,
    head: fakeEl,
    readyState: 'complete'
  };

  const localStorage = (() => {
    const store = new Map();
    return {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear(),
      key: i => Array.from(store.keys())[i] || null,
      get length() { return store.size; }
    };
  })();

  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Number, String, Boolean, Array, Object, Error, RegExp, Map, Set,
    Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    document,
    localStorage,
    sessionStorage: localStorage,
    navigator: { userAgent: 'node-test' },
    location: { href: 'http://localhost/', search: '', pathname: '/', hash: '' },
    history: { pushState: noop, replaceState: noop, back: noop, forward: noop },
    alert: noop, confirm: () => false, prompt: () => null,
    fetch: () => Promise.reject(new Error('fetch non stubbé dans les tests')),
    // Événements window/document utilisés par le script (storage, popstate, etc.)
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: clearTimeout,
    // Libs externes utilisées par le script : on les stub pour que l'init ne crashe pas.
    google: undefined,
    firebase: undefined,
    gapi: undefined,
    Chart: function() { return { update: noop, destroy: noop }; },
    jspdf: { jsPDF: function() { return { save: noop, text: noop, addPage: noop, output: () => '' }; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

// ── 3. Exécuter le script dans la sandbox ──────────────────────────────────

function loadAppScript() {
  const html = fs.readFileSync(INDEX, 'utf8');
  let js = extractScript(html);
  // Hooks de test : PRÉFIXÉS en tête de script (avant toute init qui pourrait
  // crasher) pour qu'ils soient toujours installés. Les lambdas capturent
  // le scope lexical, donc elles pourront lire/écrire `data` et
  // `filtreProprioId` une fois ces `let` initialisés plus bas dans le script.
  const hooks =
      '// ── Hooks de test (préfixés par tests/run.js) ──\n'
    + 'globalThis.__test_setData = function(d){ data = d; };\n'
    + 'globalThis.__test_setFiltre = function(v){ filtreProprioId = v; };\n'
    + 'globalThis.__test_getData = function(){ return data; };\n'
    + 'globalThis.__test_ok = true;\n\n';
  js = hooks + js;

  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  const script = new vm.Script(js, { filename: 'index.html/<script>' });
  try {
    script.runInContext(sandbox, { timeout: 5000 });
  } catch (e) {
    // Erreurs d'init (ex: gapi.load absent, google.accounts undefined) sont
    // attendues et tolérées : les fonctions testées sont déjà déclarées.
    // On garde trace de l'erreur pour debug si les hooks manquent.
    sandbox.__test_initError = e && (e.message || String(e));
  }
  return sandbox;
}

// ── 4. Runner de tests ─────────────────────────────────────────────────────

const results = { pass: 0, fail: 0, errors: [] };

function test(name, fn) {
  try {
    fn();
    results.pass++;
    console.log('  \u2713 ' + name);
  } catch (e) {
    results.fail++;
    results.errors.push({ name, error: e });
    console.log('  \u2717 ' + name);
    console.log('      ' + (e.message || e));
  }
}

function group(title, body) {
  console.log('\n' + title);
  body();
}

// ── 5. Helpers pour les tests ──────────────────────────────────────────────

function approx(actual, expected, epsilon = 0.01) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error('Attendu ~' + expected + ', reçu ' + actual);
  }
}

// Comparaison cross-realm safe (les objets/arrays créés dans le sandbox VM
// ne sont pas reference-equal à ceux du runner, même s'ils ont la même forme).
function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((msg || 'deepEq') + ' — attendu ' + e + ', reçu ' + a);
  }
}

function makeBail(overrides = {}) {
  return Object.assign({
    id: 'BAIL-TEST',
    proprioId: 'PR001',
    bienId: 'B001',
    locId: 'L001',
    debut: '2025-01-01',
    fin: '',
    loyer: 1000,
    charges: 100,
    chargesTrimestrielles: 0,
    periodiciteCharges: 'mensuelle',
    periodiciteLoyer: 'mensuelle',
    trimestres: '1,4,7,10',
    depot: 1000,
    jourEcheance: 5,
    statut: 'Actif'
  }, overrides);
}

// ── 6. Go ──────────────────────────────────────────────────────────────────

console.log('\n==============================================');
console.log('  Gestion Locative — Tests fonctions de calcul');
console.log('==============================================');

const app = loadAppScript();

// Sanity check : les fonctions sont-elles bien là ?
const expected = [
  'getPeriodiciteLoyer', 'getTrimestresBail',
  'getMontantsPeriode', 'getMoisTotal',
  'isBailActifPourMois', 'getPaiementStatut',
  'getCoutTotalAcquisition', 'getChargesAnnuelles',
  'calcMensualiteCredit', 'getMensualiteCredit',
  'calcCapitalRestant', 'getCapitalRestant',
  'getLocataireInitials',
  'collectImpayes', 'collectImpayesParLocataire'
];
const missing = expected.filter(n => typeof app[n] !== 'function');
if (missing.length) {
  console.log('\n\u274c Fonctions introuvables dans le sandbox : ' + missing.join(', '));
  console.log('   (le script a peut-être crashé avant de les déclarer)');
  if (app.__test_initError) console.log('   Erreur init : ' + app.__test_initError);
  process.exit(2);
}
if (app.__test_initError) {
  console.log('\n[info] Init du script a émis une erreur (tolérée) : ' + app.__test_initError);
}
if (typeof app.__test_setData !== 'function') {
  console.log('\n\u26A0  Les hooks __test_setData/__test_setFiltre ne sont pas installés.');
  console.log('   Erreur init : ' + (app.__test_initError || '(aucune)'));
  process.exit(2);
}

// ── PÉRIODICITÉ ────────────────────────────────────────────────────────────

group('Périodicité du loyer', () => {
  test('défaut = mensuelle', () => {
    assert.strictEqual(app.getPeriodiciteLoyer({}), 'mensuelle');
  });
  test('champ explicite respecté', () => {
    assert.strictEqual(app.getPeriodiciteLoyer({ periodiciteLoyer: 'trimestrielle' }), 'trimestrielle');
  });
  test('rétrocompat : charges trim sans periodiciteLoyer => loyer trim', () => {
    assert.strictEqual(app.getPeriodiciteLoyer({ periodiciteCharges: 'trimestrielle' }), 'trimestrielle');
  });
});

group('Trimestres du bail', () => {
  test('défaut = [1,4,7,10]', () => {
    deepEq(app.getTrimestresBail({}), [1, 4, 7, 10]);
  });
  test('custom respecté', () => {
    deepEq(app.getTrimestresBail({ trimestres: '3,6,9,12' }), [3, 6, 9, 12]);
  });
  test('valeurs hors plage filtrées', () => {
    deepEq(app.getTrimestresBail({ trimestres: '0,5,13,-1' }), [5]);
  });
});

// ── MONTANTS PÉRIODE ───────────────────────────────────────────────────────

group('getMontantsPeriode — bail mensuel simple', () => {
  const bail = makeBail({ loyer: 1000, charges: 100 });
  test('mois 5 : loyer + charges mensuelles', () => {
    const r = app.getMontantsPeriode(bail, 5);
    assert.strictEqual(r.loyerAppele, 1000);
    assert.strictEqual(r.chargesAppelees, 100);
    assert.strictEqual(r.skip, false);
    assert.strictEqual(r.isLoyerTrim, false);
  });
});

group('getMontantsPeriode — loyer trimestriel', () => {
  const bail = makeBail({
    loyer: 1000,
    charges: 0,
    periodiciteLoyer: 'trimestrielle',
    trimestres: '1,4,7,10'
  });
  test('mois d\'échéance (avril) : loyer x3', () => {
    const r = app.getMontantsPeriode(bail, 4);
    assert.strictEqual(r.loyerAppele, 3000);
    assert.strictEqual(r.skip, false);
    assert.strictEqual(r.isTrimMonth, true);
  });
  test('mois hors échéance (mai) : skip true', () => {
    const r = app.getMontantsPeriode(bail, 5);
    assert.strictEqual(r.skip, true);
    assert.strictEqual(r.isTrimMonth, false);
  });
});

group('getMontantsPeriode — charges trimestrielles', () => {
  const bail = makeBail({
    loyer: 1000,
    charges: 0,
    chargesTrimestrielles: 300,
    periodiciteCharges: 'trimestrielle',
    periodiciteLoyer: 'mensuelle',
    trimestres: '1,4,7,10'
  });
  test('janvier (mois trim) : charges 300', () => {
    const r = app.getMontantsPeriode(bail, 1);
    assert.strictEqual(r.chargesAppelees, 300);
    assert.strictEqual(r.loyerAppele, 1000);
  });
  test('février (hors trim) : charges 0, loyer quand même', () => {
    const r = app.getMontantsPeriode(bail, 2);
    assert.strictEqual(r.chargesAppelees, 0);
    assert.strictEqual(r.loyerAppele, 1000);
    assert.strictEqual(r.skip, false); // loyer mensuel, donc pas skip
  });
});

// ── MOIS TOTAL ─────────────────────────────────────────────────────────────

group('getMoisTotal', () => {
  test('mensuel simple : loyer + charges', () => {
    const bail = makeBail({ loyer: 1000, charges: 100 });
    assert.strictEqual(app.getMoisTotal(bail, 5), 1100);
  });
  test('loyer trim : mois d\'échéance = loyer x3 + charges', () => {
    const bail = makeBail({
      loyer: 1000, charges: 100,
      periodiciteLoyer: 'trimestrielle',
      trimestres: '1,4,7,10'
    });
    assert.strictEqual(app.getMoisTotal(bail, 4), 3100);
  });
  test('loyer trim : mois hors échéance = 0 + charges', () => {
    const bail = makeBail({
      loyer: 1000, charges: 100,
      periodiciteLoyer: 'trimestrielle',
      trimestres: '1,4,7,10'
    });
    assert.strictEqual(app.getMoisTotal(bail, 5), 100);
  });
});

// ── ACTIVITÉ DU BAIL ───────────────────────────────────────────────────────

group('isBailActifPourMois', () => {
  test('bail en cours, mois dans la période => actif', () => {
    const bail = makeBail({ debut: '2025-01-01', fin: '2030-12-31' });
    assert.strictEqual(app.isBailActifPourMois(bail, 5, 2026), true);
  });
  test('bail pas encore commencé => inactif', () => {
    const bail = makeBail({ debut: '2025-06-01' });
    assert.strictEqual(app.isBailActifPourMois(bail, 1, 2025), false);
  });
  test('bail terminé => inactif', () => {
    const bail = makeBail({ debut: '2020-01-01', fin: '2024-12-31' });
    assert.strictEqual(app.isBailActifPourMois(bail, 1, 2025), false);
  });
  test('fin vide = bail en cours indéfini', () => {
    const bail = makeBail({ debut: '2020-01-01', fin: '' });
    assert.strictEqual(app.isBailActifPourMois(bail, 6, 2030), true);
  });
  test('mois de début du bail = actif', () => {
    const bail = makeBail({ debut: '2025-03-15' });
    assert.strictEqual(app.isBailActifPourMois(bail, 3, 2025), true);
  });
  test('mois de fin du bail (même partiel) = actif', () => {
    const bail = makeBail({ debut: '2020-01-01', fin: '2025-03-10' });
    assert.strictEqual(app.isBailActifPourMois(bail, 3, 2025), true);
  });
  test('bail null => false', () => {
    assert.strictEqual(app.isBailActifPourMois(null, 1, 2025), false);
  });
});

// ── COÛT ACQUISITION ───────────────────────────────────────────────────────

group('getCoutTotalAcquisition', () => {
  test('somme tous les frais', () => {
    const b = {
      prixAchat: 200000, fraisNotaire: 15000, fraisAgence: 8000,
      travaux: 20000, fraisBancaires: 500, garantie: 2000,
      courtier: 1500, autresFrais: 1000
    };
    assert.strictEqual(app.getCoutTotalAcquisition(b), 248000);
  });
  test('champs manquants = 0', () => {
    assert.strictEqual(app.getCoutTotalAcquisition({ prixAchat: 100000 }), 100000);
  });
  test('objet vide = 0', () => {
    assert.strictEqual(app.getCoutTotalAcquisition({}), 0);
  });
});

group('getChargesAnnuelles', () => {
  test('somme taxe + copro + assurance + gestion + entretien', () => {
    const b = {
      taxeFonciere: 2000, copropriete: 1200, assurancePNO: 300,
      gestionLocative: 500, entretien: 800
    };
    assert.strictEqual(app.getChargesAnnuelles(b), 4800);
  });
});

// ── CRÉDIT ─────────────────────────────────────────────────────────────────

group('calcMensualiteCredit', () => {
  test('crédit 200k @ 3% sur 20 ans => ~1109.20 €/mois', () => {
    approx(app.calcMensualiteCredit(200000, 3, 240), 1109.20, 0.5);
  });
  test('taux 0 ou durée 0 => 0', () => {
    assert.strictEqual(app.calcMensualiteCredit(200000, 0, 240), 0);
    assert.strictEqual(app.calcMensualiteCredit(200000, 3, 0), 0);
  });
  test('montant 0 => 0', () => {
    assert.strictEqual(app.calcMensualiteCredit(0, 3, 240), 0);
  });
});

group('calcCapitalRestant', () => {
  test('0 échéance payée => capital = montant initial', () => {
    assert.strictEqual(app.calcCapitalRestant(200000, 3, 240, 0), 200000);
  });
  test('toutes les échéances payées => 0 (ou quasi)', () => {
    approx(app.calcCapitalRestant(200000, 3, 240, 240), 0, 1);
  });
  test('mi-parcours => entre 50% et 60% du capital', () => {
    const crd = app.calcCapitalRestant(200000, 3, 240, 120);
    if (crd < 100000 || crd > 120000) {
      throw new Error('CRD mi-parcours hors fourchette attendue : ' + crd);
    }
  });
});

// ── INITIALES LOCATAIRE ────────────────────────────────────────────────────

group('getLocataireInitials', () => {
  test('particulier : initiales prénom + nom', () => {
    const loc = { civilite: 'Mr', prenom: 'Jean', nom: 'Dupont' };
    assert.strictEqual(app.getLocataireInitials(loc), 'JD');
  });
  test('société multi-mots : initiale premier + initiale deuxième mot', () => {
    // "FLOW STUDIO" => F + S = FS (logique getLocataireInitials)
    const loc = { civilite: 'Société', nom: 'FLOW STUDIO', prenom: '' };
    assert.strictEqual(app.getLocataireInitials(loc), 'FS');
  });
  test('société un seul mot : 2 premières lettres', () => {
    const loc = { civilite: 'SCI', nom: 'Thalassa', prenom: '' };
    assert.strictEqual(app.getLocataireInitials(loc), 'TH');
  });
  test('particulier sans prénom => initiale nom dupliquée ou fallback', () => {
    const loc = { civilite: 'Mr', prenom: '', nom: 'Demilly' };
    const r = app.getLocataireInitials(loc);
    // Accepte soit "D" soit "DE" (les deux sont raisonnables, on vérifie juste non-undefined)
    assert.ok(r && r.length >= 1 && r !== 'undefined', 'initiales valides attendues, reçu: ' + r);
  });
  test('locataire totalement vide => fallback, pas de crash', () => {
    const r = app.getLocataireInitials({ civilite: '', nom: '', prenom: '' });
    assert.ok(r && r.length >= 1);
  });
});

// ── IMPAYÉS (nécessite data + filtreProprioId) ─────────────────────────────

group('collectImpayes — scénarios', () => {
  // Prépare un état minimal pour que collectImpayes tourne.
  // Note : on passe par les hooks __test_setData/__test_setFiltre parce que
  // `data` et `filtreProprioId` sont déclarés en `let` dans le scope lexical
  // du script — inaccessibles directement via le sandbox object.
  function setup(extraData = {}) {
    const d = Object.assign({
      proprios: [{ id: 'PR001', nom: 'Test SCI' }],
      biens: [{ id: 'B001', proprioId: 'PR001', designation: 'Appart test' }],
      locataires: [{ id: 'L001', civilite: 'Mr', prenom: 'Jean', nom: 'Dupont' }],
      baux: [],
      paiements: [],
      historique: []
    }, extraData);
    app.__test_setData(d);
    app.__test_setFiltre('all');
  }

  test('aucun bail actif => liste vide', () => {
    setup({ baux: [] });
    const r = app.collectImpayes();
    assert.strictEqual(r.length, 0);
  });

  test('bail résilié ignoré', () => {
    setup({
      baux: [makeBail({ id: 'BX', statut: 'Résilié', debut: '2026-01-01' })]
    });
    const r = app.collectImpayes();
    assert.strictEqual(r.length, 0);
  });

  test('bail actif sans paiement => impayés listés depuis 2026', () => {
    setup({
      baux: [makeBail({
        id: 'BX', statut: 'Actif',
        debut: '2026-01-01', loyer: 1000, charges: 100
      })],
      paiements: []
    });
    const r = app.collectImpayes();
    assert.ok(r.length >= 1, 'au moins un impayé attendu, reçu ' + r.length);
    assert.strictEqual(r[0].bail.id, 'BX');
    assert.strictEqual(r[0].montant, 1100);
  });

  test('bail actif avec paiement => pas d\'impayé pour ce mois', () => {
    setup({
      baux: [makeBail({
        id: 'BX', statut: 'Actif',
        debut: '2026-01-01', loyer: 1000, charges: 100
      })],
      paiements: [{ bailId: 'BX', mois: 1, annee: 2026, statut: 'paye' }]
    });
    const r = app.collectImpayes();
    const hasMois1 = r.some(i => i.mois === 1 && i.annee === 2026);
    assert.strictEqual(hasMois1, false, 'mois 1/2026 ne doit pas être impayé');
  });

  test('filtreProprioId filtre bien les baux', () => {
    setup({
      proprios: [
        { id: 'PR001', nom: 'SCI A' },
        { id: 'PR002', nom: 'SCI B' }
      ],
      baux: [
        makeBail({ id: 'B1', proprioId: 'PR001', debut: '2026-01-01', statut: 'Actif' }),
        makeBail({ id: 'B2', proprioId: 'PR002', debut: '2026-01-01', statut: 'Actif' })
      ]
    });
    app.__test_setFiltre('PR001');
    const r = app.collectImpayes();
    assert.ok(r.length > 0, 'au moins un impayé attendu');
    assert.ok(r.every(i => i.bail.proprioId === 'PR001'),
      'tous les impayés doivent appartenir à PR001');
    app.__test_setFiltre('all');
  });
});

group('collectImpayesParLocataire', () => {
  function setup(extraData = {}) {
    const d = Object.assign({
      proprios: [{ id: 'PR001', nom: 'Test SCI' }],
      biens: [{ id: 'B001', proprioId: 'PR001', designation: 'Appart' }],
      locataires: [
        { id: 'L001', civilite: 'Mr', prenom: 'Jean', nom: 'Dupont' },
        { id: 'L002', civilite: 'Mme', prenom: 'Marie', nom: 'Curie' }
      ],
      baux: [],
      paiements: [],
      historique: []
    }, extraData);
    app.__test_setData(d);
    app.__test_setFiltre('all');
  }

  test('3 échéances impayées pour un locataire => 1 entrée groupée', () => {
    setup({
      baux: [makeBail({
        id: 'BX', locId: 'L001',
        debut: '2026-01-01', loyer: 1000, charges: 0, statut: 'Actif'
      })]
    });
    const r = app.collectImpayesParLocataire();
    assert.strictEqual(r.length, 1, 'un seul groupe locataire attendu');
    assert.ok(r[0].echeances.length >= 3, 'au moins 3 échéances pour Jan/Fév/Mars');
    assert.strictEqual(r[0].totalMontant, r[0].echeances.length * 1000);
  });

  test('2 locataires avec impayés => 2 groupes', () => {
    setup({
      baux: [
        makeBail({ id: 'B1', locId: 'L001', debut: '2026-01-01', statut: 'Actif', loyer: 1000, charges: 0 }),
        makeBail({ id: 'B2', locId: 'L002', debut: '2026-01-01', statut: 'Actif', loyer: 800, charges: 0 })
      ]
    });
    const r = app.collectImpayesParLocataire();
    assert.strictEqual(r.length, 2);
    const ids = r.map(x => x.loc.id).sort();
    assert.deepStrictEqual(ids, ['L001', 'L002']);
  });
});

// ── RÉSULTATS ──────────────────────────────────────────────────────────────

console.log('\n==============================================');
console.log('  ' + results.pass + ' OK  |  ' + results.fail + ' KO');
console.log('==============================================\n');

if (results.fail > 0) {
  console.log('Détail des échecs :');
  results.errors.forEach(({ name, error }) => {
    console.log('  \u2717 ' + name);
    console.log('      ' + (error.stack || error.message || error).split('\n').slice(0, 3).join('\n      '));
  });
  process.exit(1);
}
process.exit(0);
