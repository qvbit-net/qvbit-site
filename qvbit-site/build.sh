#!/usr/bin/env bash
set -e

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
cp sitemap.xml _site/
cp style.css _site/
cp favicon.png _site/

cp -R images _site/images

echo "Copying built CRM..."

cp -R crm/dist/. _site/crm/

echo "QVB I.T. deployment build complete."
