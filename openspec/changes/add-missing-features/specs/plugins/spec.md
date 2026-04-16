# Plugins Spec

## ADDED Requirements

### The system SHALL provide a Mermaid diagram plugin

A `@nexus/plugin-mermaid` package SHALL render `mermaid` code blocks as SVG diagrams when the cursor is outside, and show raw mermaid source when the cursor is inside.

#### Scenario: Render mermaid diagram
- **WHEN** document contains a fenced code block with language `mermaid`
- **AND** cursor is outside the block
- **THEN** the block SHALL be rendered as an SVG diagram via mermaid.js

#### Scenario: Edit mermaid source
- **WHEN** cursor enters a mermaid code block
- **THEN** the raw mermaid syntax SHALL be shown for editing
- **AND** syntax highlighting SHALL be applied

#### Scenario: Invalid mermaid syntax
- **WHEN** the mermaid source has syntax errors
- **THEN** an error message SHALL be displayed instead of the diagram

### The system SHALL support list item drag reorder

List items SHALL have grip handles (similar to table rows) that allow drag-and-drop reordering.

#### Scenario: Drag list item down
- **WHEN** user drags a list item grip handle downward past another item
- **THEN** the dragged item SHALL move below the target item in the document

#### Scenario: Drag preserves indentation
- **WHEN** a nested list item is dragged
- **THEN** its indentation level SHALL be preserved after the move
