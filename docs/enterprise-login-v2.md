# Enterprise UI V2 — Phase 1／Phase 2 驗收

Scope: design tokens and the four login screens only. Portal home, authenticated workspaces, permissions, credentials, request workflows and report processing retain their existing behavior. Phases 3–6 await acceptance as requested in the supplied design brief.

## 修改檔案

| Files | Purpose |
| --- | --- |
| `src/EnterpriseLoginLayout.jsx` | Shared split layout, system introduction, feature icons, icon-only theme control and header help |
| `src/EnterpriseLogin.css` | Scoped enterprise tokens, light/dark surfaces, diagonal blue divider and responsive login panel |
| `src/LmsApp.jsx`, `src/LabApp.jsx`, `src/RequestApp.jsx` | Wrap existing forms without changing authentication; LMS login also serves the validation preview |
| `vite.config.js`, `docs/interface-preferences.md` | Keep source translation dictionaries live instead of prebundling the custom JSX adapters |
| `src/i18n.mjs` | English translations for new interface text, using the existing language preference |
| `public/branding/laboratory-login.jpg` | Generated illustrative electronics-lab background; not a photograph of the actual COLONG facility |
| `e2e/login-layout.spec.js`, `e2e/login-credentials.spec.js`, `e2e/control-alignment.spec.js`, `e2e/system-theme.spec.js`, `e2e/preferences-and-chart.spec.js` | Update visual expectations to the approved split layout and flat blue actions; retain credential and workflow checks |
| `docs/reviews/enterprise-login-v2/` | Actual Chromium screenshots before and after, including mobile and both themes |

The existing COLONG transparent logo is reused unchanged. The existing `CompanyBrandLogo` component applies its white-letter overlay only to the wordmark in dark mode, preserving the red emblem. Global theme storage and account/session storage are unchanged. Validation remains a disabled preview.

## 實際瀏覽器截圖

Desktop captures: 1440 × 900. Mobile captures: 390 × 844, full page. These are actual browser captures, not generated interface mockups. Only the decorative laboratory background is generated.

| System | Before, light | After, light | Before, dark | After, dark | Mobile light | Mobile dark |
| --- | --- | --- | --- | --- | --- | --- |
| lms | [檢視](reviews/enterprise-login-v2/before-lms-light.png) | [檢視](reviews/enterprise-login-v2/after-lms-light.png) | [檢視](reviews/enterprise-login-v2/before-lms-dark.png) | [檢視](reviews/enterprise-login-v2/after-lms-dark.png) | [檢視](reviews/enterprise-login-v2/mobile-lms-light.png) | [檢視](reviews/enterprise-login-v2/mobile-lms-dark.png) |
| request | [檢視](reviews/enterprise-login-v2/before-request-light.png) | [檢視](reviews/enterprise-login-v2/after-request-light.png) | [檢視](reviews/enterprise-login-v2/before-request-dark.png) | [檢視](reviews/enterprise-login-v2/after-request-dark.png) | [檢視](reviews/enterprise-login-v2/mobile-request-light.png) | [檢視](reviews/enterprise-login-v2/mobile-request-dark.png) |
| lab | [檢視](reviews/enterprise-login-v2/before-lab-light.png) | [檢視](reviews/enterprise-login-v2/after-lab-light.png) | [檢視](reviews/enterprise-login-v2/before-lab-dark.png) | [檢視](reviews/enterprise-login-v2/after-lab-dark.png) | [檢視](reviews/enterprise-login-v2/mobile-lab-light.png) | [檢視](reviews/enterprise-login-v2/mobile-lab-dark.png) |
| validation | [檢視](reviews/enterprise-login-v2/before-validation-light.png) | [檢視](reviews/enterprise-login-v2/after-validation-light.png) | [檢視](reviews/enterprise-login-v2/before-validation-dark.png) | [檢視](reviews/enterprise-login-v2/after-validation-dark.png) | [檢視](reviews/enterprise-login-v2/mobile-validation-light.png) | [檢視](reviews/enterprise-login-v2/mobile-validation-dark.png) |

## 驗證與人工驗收

- Production build and lint: passed.
- Unit tests: 188 passed.
- Full browser regression: 128 passed, with one duplicate-heading locator failure in the validation entry. The introduction title was corrected to preserve a single page heading; that case then passed on rerun (1/1).
- Final focused browser regression after the localization configuration fix: 27/27 passed (all four login layouts, credential controls, themes, preferences, administrator migration and level 2 access).
- `git diff --check`: passed.
- Manual browser checks: mobile layout has no horizontal overflow; light inputs calculate to `#FFFFFF`, dark inputs to `#142C44`, and primary buttons to `#0866E8` across all four entries. Header help opens and closes; new interface text follows the existing English preference.

Known issues: no remaining functional failures found. Visual acceptance is pending.

Manual acceptance requested: compare the supplied reference images with both desktop themes; confirm the background, diagonal divider, right-panel proportions, logo contrast and mobile stacking. Review visual spacing on your normal monitor and browser zoom. The DQA entry remains unavailable for sign-in by design.

No main-branch merge or production deployment is part of this delivery. This branch is based on the prior functional work in PR #26 so those preferences and permissions remain available.
