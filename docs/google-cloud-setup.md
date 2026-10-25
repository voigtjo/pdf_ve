# Google Cloud einrichten

Die Erweiterung braucht einen eigenen OAuth-Client, damit Google die Anmeldung erlaubt. Das dauert etwa zehn Minuten und ist kostenlos.

## 1. Projekt anlegen

1. [console.cloud.google.com](https://console.cloud.google.com/) öffnen und mit deinem Google-Konto anmelden.
2. Oben in der Projektauswahl **Neues Projekt** wählen, Name `pdf_ve`, **Erstellen**.
3. Sicherstellen, dass oben das Projekt `pdf_ve` ausgewählt ist.

## 2. Google Drive API aktivieren

1. Menü **APIs und Dienste → Bibliothek**.
2. Nach **Google Drive API** suchen, öffnen, **Aktivieren**.

## 3. Zustimmungsbildschirm (Google Auth Platform)

1. Menü **APIs und Dienste → OAuth-Zustimmungsbildschirm** (heißt teils auch **Google Auth Platform**), **Jetzt starten**.
2. App-Name `pdf_ve`, deine E-Mail als Support-Adresse.
3. Zielgruppe: **Extern**.
4. Kontakt-E-Mail eintragen, den Nutzungsbedingungen zustimmen, **Erstellen**.
5. Unter **Zielgruppe → Testnutzer** deine eigene Gmail-Adresse hinzufügen. Nur Testnutzer können sich anmelden, solange die App im Testmodus ist.
6. Unter **Datenzugriff → Bereiche hinzufügen oder entfernen** den Bereich `https://www.googleapis.com/auth/drive` auswählen (ggf. unten manuell eintragen) und speichern.

## 4. OAuth-Client für die Chrome-Erweiterung

1. Unter **Clients → Client erstellen**.
2. Anwendungstyp: **Chrome-Erweiterung**.
3. Name: `pdf_ve`.
4. Element-ID (Item ID): `kneiagljaijhkhalnhbmaogckkpaikee`
5. **Erstellen** und die angezeigte **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`).

## 5. Client-ID eintragen

In `public/manifest.json` den Platzhalter ersetzen:

```json
"oauth2": {
  "client_id": "123456789-abc….apps.googleusercontent.com",
  ...
}
```

Danach `npm run build` und die Erweiterung in `chrome://extensions` neu laden. Die Client-ID einer Chrome-Erweiterung ist kein Geheimnis und darf ins Repository.

## Hinweise

- Beim ersten Anmelden zeigt Google „Google hat diese App nicht überprüft“. Das ist im Testmodus normal: **Erweitert → Weiter zu pdf_ve**.
- Im Testmodus läuft die Zustimmung nach 7 Tagen ab; dann einfach erneut anmelden.
- `chrome.identity` nutzt das in Chrome angemeldete Google-Konto. Ist Chrome mit keinem Konto angemeldet, fragt Chrome beim Anmelden danach.
