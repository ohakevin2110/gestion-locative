#!/bin/bash
# ── Deploy Gestion Locative sur GitHub Pages ──
# Double-clique sur ce fichier ou lance : ./deploy.sh

cd "$(dirname "$0")"

# Init git si pas encore fait
if [ ! -d ".git" ]; then
  git init
  git remote add origin https://github.com/ohakevin2110/gestion-locative.git
  git branch -M main
fi

# Sync les deux fichiers
cp Gestion_Locative.html index.html 2>/dev/null

# Commit & push
git add index.html Gestion_Locative.html
git commit -m "Update app $(date '+%d/%m/%Y %H:%M')"
git push -u origin main --force

echo ""
echo "✅ Déployé ! Ton site est à jour sur :"
echo "   https://ohakevin2110.github.io/gestion-locative/"
echo ""
read -p "Appuie sur Entrée pour fermer..."
