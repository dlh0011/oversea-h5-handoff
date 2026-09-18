# PAGE / Design Handoff

## Purpose

An everyday working surface for designers reviewing H5 deliveries. The project
and its actual preview are the content. Upload, annotate, compare versions and
download remain the existing workflow.

## References

- VoltAgent/awesome-design-md: design-md/mintlify/DESIGN.md, neutral documentation
  surfaces, readable typography and three-column hierarchy.
- VoltAgent/awesome-design-md: design-md/linear.app/DESIGN.md, precise controls,
  product-first composition and separation by hairlines rather than shadows.
- These are design analyses, not official component libraries. We use a light
  workspace rather than copying marketing-page heroes or proprietary fonts.

## Visual System

- Apple-inspired light workspace: #f5f5f7 page background, white content surfaces,
  #f2f2f5 preview canvas, and a quiet #f7f7f8 navigation rail.
- Text #1d1d1f; secondary #6e6e73; border #d2d2d7; soft divider #e8e8ed.
- Primary command #1d1d1f; focus/selection blue #0071e3 with a light blue fill.
- Amber for review, green for approved, red for errors. Status colors stay local to
  badges and markers instead of tinting whole sections.
- System sans-serif for Chinese and Latin, 13px body and controls, 12px secondary,
  22px page title, 14px section title. Letter spacing 0 throughout.
- 4px spacing unit; controls 36px tall; 8-12px corners for controls and surfaces,
  999px only for status pills and compact tags.
- Use hairlines and modest shadows for hierarchy. No hero slogans, decorative stats
  tiles, orbs, fake product illustrations, gradients, decorative glass panels, or
  thick device mockup borders. Translucency is reserved for navigation chrome and
  toolbars where it clarifies hierarchy.

## Surfaces

- Projects: compact heading, inline counts, table-like list with real preview
  thumbnails. Search and status filter are actual working controls.
- Review: compact project/version bars; page rail, neutral preview canvas,
  inspector. Keep a fixed H5 width and scale its outer wrapper on small screens.
- Inspector: readable labels and inputs; one clear save action; no oversized
  empty-state icons or sales copy.
- Downloads and issues: flat rows, clear metadata, stable alignment.
- Narrow screens: navigation becomes a top rail, page choices wrap, canvas and
  inspector stack. No minimum body width or accidental horizontal page scroll.
- The H5 preview remains at its source dimensions and is scaled by the outer stage;
  the device outline, annotation markers, tooltip, and inspector are management UI.
- Apple Store reference cues are translated into the tool workflow: translucent
  navigation chrome, generous page breathing room, pill-shaped filters and actions,
  rounded project rows, and direct black/blue action hierarchy. The site remains a
  work surface rather than a product marketing page.
- Interaction feedback follows the Apple Design skill: controls respond on press,
  draggable markers remain directly manipulable, movement is not locked during
  transitions, and reduced motion/transparency preferences are respected.
- Annotation bubbles use a liquid-glass material: translucent tinted fill,
  backdrop blur, bright rim, inset highlight, and a soft depth shadow. The preview
  remains visible through the material; high-contrast and reduced-transparency modes
  fall back to solid white for readable text.

## Scope

Only the management interface changes. Existing H5 files, original ZIPs, Figma
layer naming rules and project data remain intact. The feedback loop surfaces
the handoff state without pretending that the website changed source code.
