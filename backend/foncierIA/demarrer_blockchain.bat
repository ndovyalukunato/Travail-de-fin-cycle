@echo off
chcp 65001 >nul
title FoncierAI - Blockchain
cd /d "%~dp0"

echo ============================================================
echo   FoncierAI - Demarrage de la blockchain locale (Ganache)
echo ============================================================
echo.

where ganache >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Ganache n'est pas installe. Installez-le avec :
    echo          npm install -g ganache
    pause
    exit /b 1
)

REM --wallet.deterministic : toujours les memes comptes (donc la meme adresse de contrat)
REM --database.dbPath      : la chaine est sauvegardee entre deux redemarrages
echo Lancement de Ganache dans une nouvelle fenetre (ne pas la fermer)...
start "Ganache - FoncierAI" cmd /k ganache --wallet.deterministic --database.dbPath ./ganache-data

echo.
python blockchain\verifier_contrat.py
if errorlevel 1 (
    echo.
    echo [ERREUR] Le contrat n'a pas pu etre verifie ou deploye.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Blockchain prete. Vous pouvez lancer Django :
echo       python manage.py runserver
echo.
echo   Comptes a utiliser comme adresses Ethereum (page Utilisateurs) :
echo       (1) 0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0
echo       (2) 0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b
echo       (3) 0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d
echo       (4) 0xd03ea8624C8C5987235048901fB614fDcA89b117
echo       (5) 0x95cED938F7991cd0dFcb48F0a06a40FA1aF46EBC
echo ============================================================
echo.
pause
