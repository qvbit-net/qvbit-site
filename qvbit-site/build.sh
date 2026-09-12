#!/usr/bin/env bash
set -e

# Always run from the directory where this script lives.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Build script directory: $SCRIPT_DIR"
echo "Building QVB I.T. CRM..."

npm install --prefix crm
npm run build --prefix crm

echo "Preparing Cloudflare Pages output..."

rm -rf _site
mkdir -p _site/crm

echo "Copying public QVB I.T. website..."

cp index.html _site/
cp about.html _site/
cp contact.html _site/
cp managed-it.html _site/
cp network-installation.html _site/
cp network-staging.html _site/
cp remote-hands.html _site/
cp services.html _site/
cp structured-cabling.html _site/
cp support.html _site/
cp sitemap.xml _site/
cp style.css _site/
cp favicon.png _site/

cp -R images _site/images

# Cloudflare Pages Functions must be present in the deployment output.
if [ -d functions ]; then
  cp -R functions _site/functions
fi

echo "Copying built CRM..."

cp -R crm/dist/. _site/crm/

echo "Configuring CRM SPA fallback..."

cp _site/crm/index.html _site/crm/404.html

echo "QVB I.T. deployment build complete."
