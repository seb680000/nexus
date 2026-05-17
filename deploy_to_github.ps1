param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath ".\index.html")) {
  throw "Lance ce script depuis le dossier github-deploy."
}

if (-not (Test-Path -LiteralPath ".\.git")) {
  git init -b main
}

git add index.html README.md .nojekyll .github/workflows/pages.yml
git -c user.name="Nexus Concept" -c user.email="nexus@example.local" commit -m "Deploy Nexus to GitHub Pages"

$existingRemote = git remote
if ($existingRemote -contains "origin") {
  git remote set-url origin $RepositoryUrl
} else {
  git remote add origin $RepositoryUrl
}

git push -u origin main
