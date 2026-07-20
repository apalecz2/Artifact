# Anchor Privacy Policy

**Effective date / last updated: July 13, 2026**

This Privacy Policy describes how **Anchor** (the desktop application for Windows and
macOS, the "App"), its marketing website, and its download service handle information.
Anchor is developed and published by **Aiden Paleczny** ("we", "us"). Contact:
**aiden.paleczny@gmail.com**.

The short version: **Anchor processes your documents entirely on your device. Your
documents, and anything extracted from them, never leave your computer. We operate no
accounts, no analytics, no advertising, and no telemetry.**

## 1. Information the App processes — locally only

Anchor's purpose is to extract structured tables from documents you choose (PDFs and
images). Those documents may contain personal or sensitive information. All of the
following is created and stored **only on your device**, in the App's data directory
(`com.aidenpaleczny.anchor` under your operating system's application-data folder):

- the documents you open, and page images rendered from them;
- text recognized from those documents (OCR output) and the tables extracted from them,
  including provenance and confidence data;
- a local SQLite database of your sessions and settings.

**None of this content is transmitted to us or to any third party.** Optical character
recognition and AI extraction both run on your device: OCR via a bundled Tesseract
engine, and extraction via a local AI model served by a `llama-server` process that
listens only on your own machine's loopback interface (`127.0.0.1`). Exported files
(XLSX/CSV) are written only where you choose to save them.

We have no access to your documents or extracted data, and therefore cannot view,
recover, or delete them for you.

## 2. The App's only network activity

The App makes network connections in exactly one situation: the **first-run setup
download** (and any later re-download you initiate, e.g. after removing downloaded data).
During setup, the App downloads the components it needs to work — the Tesseract OCR
engine, the llama.cpp model server, the PDFium renderer, optional GPU runtime libraries,
and AI model files (~3.5 GB total) — from:

- `anchor-assets.aidenpaleczny.com`, a download mirror we operate on Cloudflare R2; with
- `huggingface.co` as a fallback source for the model files.

These requests **send no personal information and no document content** — they are plain
file downloads. Like any web server, the download service (operated on Cloudflare
infrastructure) receives standard connection metadata (your IP address, user-agent, and
the requested file) and may record it in short-lived operational logs used for serving
files and preventing abuse. We do not use this metadata to identify users, do not combine
it with any other data, and receive no per-user analytics from it. Every downloaded file
is verified against a pinned SHA-256 checksum before use.

After setup completes, the App works **fully offline**. It performs no update checks, no
crash reporting, no analytics, and no other network calls. (The App's internal
communication with its local model server stays on `127.0.0.1` and never leaves your
machine.)

If you install Anchor from the Microsoft Store, Microsoft may process installation and
licensing data under [Microsoft's privacy statement](https://privacy.microsoft.com/); we
do not receive personal information from it.

## 3. Your control and data deletion

Everything the App stores is on your device and under your control:

- **Delete sessions** in the App to remove their documents, images, and extracted data
  from the local database.
- **Remove all downloaded data** (models, binaries, cache, database) via the App's
  settings, or by deleting the `com.aidenpaleczny.anchor` application-data folder.
- Uninstalling the App removes the program; if any downloaded data remains in the
  application-data folder, it can be deleted as above.

Because we hold no copy of your data, there is nothing for us to delete, export, or
disclose on our side.

## 4. The website

Our marketing website is a static site with **no accounts, no analytics scripts, no
advertising, and no tracking cookies**. Its hosting infrastructure receives standard
server-log metadata (IP address, user-agent, pages requested) as an inherent part of
serving web pages, used only for operation and abuse prevention.

## 5. Children

Anchor is a productivity tool, is not directed at children, and collects no personal
information from anyone, including children.

## 6. Legal bases and international use

Anchor is designed so that no personal data is collected or transmitted by us. To the
extent that transient connection metadata in §2 and §4 constitutes personal data in your
jurisdiction (e.g. under the GDPR), it is processed on the basis of legitimate interest
in operating and securing the download service, is minimal, and is not used for
profiling. You may use the App entirely offline after setup.

## 7. Changes to this policy

If Anchor ever gains features that change what this policy describes — for example crash
reporting, update checks, payments, or any transmission of data off the device — this
policy will be updated **before** that feature ships, with a new "last updated" date, and
material changes will be highlighted in the release notes. The current version is always
available at the URL where you are reading it and in the App's About screen.

## 8. Contact

Questions or concerns about privacy: **aiden.paleczny@gmail.com**.
