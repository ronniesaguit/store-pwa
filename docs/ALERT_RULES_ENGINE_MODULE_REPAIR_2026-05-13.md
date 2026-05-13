# Alert Rules Engine Module Repair

Date: 2026-05-13
Module: alert_rules_engine
Classification: USABLE / PASSED for Alerts Center list and severity filters

Problem Found:
- Live getAlerts API failed with: D1_ERROR: no such table: branches.
- Front-end Alerts Center calls API.call("getAlerts", params).
- Worker getAlerts used LEFT JOIN branches even when the store database did not have the branches table.

Basis:
- getAlerts checks alert_rules_engine.view permission.
- getAlerts calls generateAlerts2, then reads active alerts.
- generateAlerts2 already catches failure, but the final getAlerts query still joined branches directly.

Repair Applied:
- Patched Worker getAlerts to detect whether the branches table exists.
- If branches exists, getAlerts uses LEFT JOIN branches and returns branch_name.
- If branches does not exist, getAlerts uses SELECT a.*, NULL as branch_name FROM alerts a.
- This keeps single-store tenants safe while preserving future multi-branch behavior.

Verification:
- node --check index.js passed.
- Wrangler deploy succeeded.
- Live getAlerts returned success true with empty data.
- Live getAlerts severity=critical returned success true.
- Live getAlerts severity=watch returned success true.
- Live getAlerts severity=info returned success true.

Known Follow-up:
- getAlertById still joins branches. Patch only if a verified UI/API detail path requires it.

Status:
alert_rules_engine Alerts Center list/filter path repaired and verified.
