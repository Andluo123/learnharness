# Resources

A LearnHarness plugin: a right-hand file browser for the local filesystem.
Preview files in place and hand any path to the teacher agent.

## What it previews

| Format | Rendering |
| --- | --- |
| PDF | the browser's own viewer (no bundled renderer) |
| Images | inline, scaled to the panel |
| Text, Markdown, code | monospaced text, truncated at 2 MB |
| Office `.docx` | converted to sanitised HTML |
| Office `.xlsx` / `.xlsm` | real tables, first 2000 rows x 100 columns |
| Office `.pptx` | per-slide text |
| Legacy `.doc` / `.xls` / `.ppt` | refused with a save-as hint |

Office documents are converted server-side (mammoth for docx, SheetJS for
xlsx, a zip-and-XML extractor for pptx). Every operation is read-only: the
plugin never writes, moves, deletes or executes anything.

## Usage

1. Enable **Resources** in Settings -> Community plugins.
2. Click the Resources button in the left sidebar, or the one in a session top bar.
3. Pick a drive (or `~`) and browse. The panel opens the whole machine; there is
   no folder to authorize first.
4. Click a file to preview it.
5. Use **Hand to agent** to put the file path in the composer without sending it.

## Panel chrome

- The divider on the panel left edge resizes it (280-720 px); the width is remembered.
- The top-bar toggle collapses the panel to a single button and restores it. The
  panel keeps its current folder and preview across collapsing.
