# DoctorAI World

DoctorAI World is the safety-led personal health hub for organising medications, symptoms, appointments, documents, results and care conversations.

## Source of truth

- Current production site: https://www.doctoraiworld.com/health-hub
- Shared source workspace: https://drive.google.com/drive/folders/19jI9lFjTdmT5PqelJpCMWzHKZ-pfltWL
- Backup archive: see the shared workspace folder

This repository is the canonical DoctorAI World handoff/index. The legacy `Doctorai` repository is not the current production source.

## Safety and contribution rules

- DoctorAI must never present itself as a doctor, diagnose, prescribe or tell a person to change treatment.
- Keep emergency guidance visible and accurate.
- Never commit secrets, API keys, tokens, `.env` files, private health data or staff credentials.
- Inspect the existing project rules before editing, run the available checks, and verify production-like routes before publishing.

## Working across PCs

Download the newest timestamped source archive from the shared workspace into a local checkout. Do not overwrite another snapshot; create a new timestamped archive after meaningful changes.