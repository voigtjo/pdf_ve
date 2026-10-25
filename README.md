# pdf_ve

PDF-Viewer und -Editor als Chrome-Erweiterung. Die Anmeldung läuft über Google; die Erweiterung legt in Google Drive den Ordner `pdf_ve` mit den Unterordnern `In` und `Out` an.

- **In:** hochgeladene Dateien, Formulare und PDFs, die bearbeitet werden sollen. Die Originale bleiben unverändert.
- **Out:** Ergebnisse, also ausgefüllte Formulare und bearbeitete PDFs.

Die gesamte PDF-Verarbeitung passiert lokal im Browser, es gibt keinen eigenen Server.

## Stand

Phase 0 (Grundgerüst):

- Google-Anmeldung über `chrome.identity`
- Ordner `pdf_ve/In` und `pdf_ve/Out` anlegen bzw. wiederfinden
- PDFs nach In hochladen, Liste von In anzeigen (auch Dateien, die direkt im Drive abgelegt wurden)
- PDF anzeigen (pdf.js)
- Testweise eine Kopie nach Out speichern (pdf-lib), Name z. B. `Vertrag_bearbeitet_2026-10-25.pdf`

Als Nächstes (Phase 1): Seiten löschen, drehen, umsortieren, einfügen; PDFs zusammenführen und teilen; Formulare ausfüllen.

## Einrichten

1. Google-Cloud-Projekt und OAuth-Client anlegen: siehe [docs/google-cloud-setup.md](docs/google-cloud-setup.md). Die Client-ID steht bereits in `public/manifest.json` unter `oauth2.client_id`.
2. Bauen (Node.js 20.19 oder neuer):
   ```sh
   npm install
   npm run build
   ```
3. In Chrome `chrome://extensions` öffnen, oben rechts **Entwicklermodus** einschalten, **Entpackte Erweiterung laden** und den Ordner `dist` wählen.
4. Das pdf_ve-Symbol in der Symbolleiste anklicken (ggf. über das Puzzle-Symbol anheften) und **Mit Google anmelden**.

Nach Codeänderungen `npm run build` ausführen und in `chrome://extensions` bei pdf_ve auf den Neu-laden-Pfeil klicken. `npm run dev` baut bei jeder Änderung automatisch neu.

Die Erweiterungs-ID ist durch den `key` im Manifest fest: `kneiagljaijhkhalnhbmaogckkpaikee`.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `public/manifest.json` | Manifest V3, Berechtigungen, OAuth-Client |
| `src/background.ts` | Service Worker, öffnet nach der Installation den Editor |
| `src/popup/` | Popup: Anmelden, Editor öffnen, Abmelden |
| `src/editor/` | Editor-Tab: Dateiliste von In, Anzeige, Speichern nach Out |
| `src/lib/auth.ts` | Google-Token holen und verwerfen |
| `src/lib/drive.ts` | Drive REST API v3: Ordner, Liste, Up- und Download |
| `src/lib/viewer.ts` | Anzeige mit pdf.js |
| `src/lib/naming.ts` | Dateinamen für Ergebnisse in Out |

## Berechtigungen

Die Erweiterung nutzt den vollen Drive-Bereich (`https://www.googleapis.com/auth/drive`), damit sie auch Dateien sieht, die direkt im Drive-Web in `In` abgelegt werden. Für den Eigengebrauch im Testmodus des Google-Cloud-Projekts ist das ohne Prüfung möglich; eine Veröffentlichung im Chrome Web Store würde eine Sicherheitsprüfung durch Google erfordern.
