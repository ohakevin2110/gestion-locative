# Setup Firebase pour Gestion Locative

Ce guide te prend 5 minutes. Il te permet de créer un projet Firebase gratuit, d'activer l'authentification par email, et la base de données Firestore pour stocker les données des utilisateurs qui se connectent par email.

Tu n'auras **rien à payer** pour ton usage (2–10 utilisateurs). Les quotas gratuits sont très largement au-dessus de ce que tu vas consommer.

---

## Étape 1 — Créer un projet Firebase

1. Va sur https://console.firebase.google.com/
2. Clique sur **"Ajouter un projet"** (ou "Create a project")
3. Nom du projet : `gestion-locative` (ou autre, peu importe)
4. Désactive Google Analytics (pas nécessaire pour une petite app)
5. Clique sur **"Créer le projet"** → attends ~30 secondes

---

## Étape 2 — Activer l'authentification email/password

1. Dans le menu de gauche : **Build → Authentication**
2. Clique sur **"Commencer"** (ou "Get started")
3. Onglet **"Sign-in method"** → clique sur **"Email/Password"**
4. Active le premier toggle (**Email/Password**). Laisse le second (Email link) désactivé.
5. Clique sur **"Enregistrer"**

---

## Étape 3 — Créer la base Firestore

1. Dans le menu de gauche : **Build → Firestore Database**
2. Clique sur **"Créer une base de données"**
3. **Mode production** (important pour la sécurité) → Suivant
4. Région : choisis **`europe-west1`** (Belgique) ou **`europe-west3`** (Francfort) — pour conformité RGPD
5. Clique sur **"Activer"** → attends ~30 secondes

### Règles de sécurité Firestore (IMPORTANT)

Une fois la base créée, onglet **"Règles"** (Rules) :

Remplace tout le contenu par :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Chaque utilisateur ne peut lire/écrire QUE ses propres données
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Clique sur **"Publier"**. C'est ce qui garantit qu'un utilisateur ne peut pas voir les données d'un autre.

---

## Étape 4 — Ajouter une application Web et récupérer la config

1. Retour à la page d'accueil du projet (icône maison en haut à gauche)
2. Sous "Commencez par ajouter Firebase à votre application", clique sur l'icône **`</>`** (Web)
3. Surnom de l'app : `gestion-locative-web` → clique sur **"Enregistrer l'app"** (ne coche PAS "Configurer Firebase Hosting")
4. Tu vois apparaître un bloc de code qui ressemble à ça :

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "gestion-locative-xxxxx.firebaseapp.com",
  projectId: "gestion-locative-xxxxx",
  storageBucket: "gestion-locative-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

**⚠️ Copie ces valeurs quelque part, tu vas les coller dans `index.html`.**

Clique ensuite sur **"Continuer vers la console"**.

---

## Étape 5 — Autoriser ton domaine GitHub Pages

1. Retour dans **Authentication → Settings → Authorized domains**
2. Vérifie que `localhost` et `<ton-projet>.firebaseapp.com` sont présents
3. Clique sur **"Ajouter un domaine"**
4. Ajoute : **`ohakevin2110.github.io`**
5. Enregistre

Sans cette étape, le login email ne fonctionnera pas depuis GitHub Pages.

---

## Étape 6 — Coller la config dans index.html

Ouvre `index.html` et cherche le bloc :

```javascript
// ─── FIREBASE CONFIG — À REMPLIR APRÈS CRÉATION DU PROJET ───
const FIREBASE_CONFIG = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI"
};
```

Remplace chaque `"REMPLACE_MOI"` par les valeurs que tu as copiées à l'étape 4.

Sauvegarde, `git add . && git commit -m "config firebase" && git push`.

---

## Étape 7 — Tester

1. Va sur https://ohakevin2110.github.io/gestion-locative/
2. Vide le localStorage (DevTools → Application → Clear site data) OU ouvre en navigation privée
3. Tu dois voir l'écran de login avec un **toggle Google / Email**
4. Clique sur **Email** → **Créer un compte**
5. Entre un email + mot de passe (min 6 caractères)
6. Tu devrais être connecté et voir le dashboard vide
7. Ajoute un propriétaire pour tester la sauvegarde
8. Retour dans Firebase Console → Firestore Database → tu dois voir un document `users/<ton-uid>/data/main` avec tes données

---

## Sécurité — ce qu'il faut savoir

- **apiKey Firebase n'est PAS secret** : c'est un identifiant public, normal qu'il apparaisse dans `index.html`. La vraie sécurité vient des **règles Firestore** (étape 3) qui empêchent un user de lire les données d'un autre.
- **Mot de passe** : Firebase Auth hash les mots de passe côté serveur (bcrypt). Ils ne sont jamais stockés en clair, ni par toi ni par Firebase visible.
- **RGPD** : les données sont hébergées en Europe (région `europe-west1` ou `europe-west3`). Tu peux à tout moment supprimer un user depuis Firebase Console → Authentication, et ses données depuis Firestore.

---

## Coûts — à quoi faire attention

Quotas gratuits Firebase (plan Spark) pour ton usage :

| Ressource | Quota gratuit | Ton usage estimé |
|---|---|---|
| Firestore lectures | 50 000 / jour | < 500 |
| Firestore écritures | 20 000 / jour | < 100 |
| Firestore stockage | 1 Go | < 1 Mo |
| Auth users | 50 000 MAU | 2–10 |
| Bande passante | 10 Go / mois | négligeable |

Tu ne risques pas de dépasser. En cas de doute, tu peux mettre une limite de budget à 0€ dans la Google Cloud Console pour être 100% sûr.
