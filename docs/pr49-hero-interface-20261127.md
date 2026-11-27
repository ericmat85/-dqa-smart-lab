# Management hero backgrounds and interface finishing

Administration tabs now meet the content frame at its top and sides. Scroll buttons use centered SVG chevrons, share a continuous surface with the tab strip and have no spacer gaps. Existing keyboard, touch and active-tab navigation remain available.

The management overview combines workspace identity, time zone and refresh status within the hero. Refreshing updates the inline status with a Taiwan-time timestamp instead of inserting a separate notice above the hero. The hero retains readable white text with a dark image overlay at all screen sizes.

Interface Settings now includes ten original, bundled SVG background images, a live preview and custom PNG/JPEG/WebP upload. Preset and custom choices are explicitly saved to the current browser as interface preferences and survive navigation/reload; they do not change shared database configuration. Custom images are decoded, resized to at most 1920×1080, normalized to JPEG and constrained before storage. SVG/remote URLs are not accepted as uploads. Cancel and restore-default actions retain existing saved state until the user saves.

Read-only request information dialogs no longer show a bottom close row. The header close button, Escape, focus return and modal keyboard handling remain; the returned-request edit action is retained where applicable. Archived PDF downloads use a solid red button while retaining the existing authorized reader. Shared sidebar logos increase from 170 to 184 CSS pixels within the available width. Total-account and disabled-account icons have transparent backgrounds; the disabled icon is red, while metric labels retain their normal theme color.

Validation covers desktop/mobile views, 320 px, dark mobile and 1920 px; tab/button geometry; refresh placement; ten distinct images; saved preferences across reload; normalized uploads and rejected SVG; footer removal, header/Escape exit and red PDF styling; transparent metric icons and logo sizing across all three systems. Seven Node tests verify image asset/URL constraints, preference persistence/storage failures and existing UI preferences. Build and lint checks are recorded with the protected Preview evidence.

This change has no schema or actual business-data writes. The previously stored shared COLONG IE logo remains in the database. Migrations through 052 are already installed and must not be replayed. Delivery stays on PR 49's protected Preview branch; Main, Production frontend, persistent environment settings, SSO and Render remain unchanged.
