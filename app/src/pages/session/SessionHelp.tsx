import React from 'react';
import { HelpItem } from '../../components/HelpOverlay';
import { formatShortcut } from '../../lib/platform';

export function SourceHelp(): React.ReactElement {
    return (
        <>
            <p className="text-on-surface-variant">
                This pane shows your source document with the text the app detected (OCR)
                overlaid on the image. Use it to check and correct what was read before
                formatting a table.
            </p>
            <HelpItem icon="draw" title="Edit tool">
                Draw a box over missing text to add a word, or click an existing word's box
                to edit or delete it.
            </HelpItem>
            <HelpItem icon="pan_tool" title="Pan tool">
                Switch to Pan to drag the page around without drawing. You can also scroll
                to pan and pinch/scroll to zoom.
            </HelpItem>
            <HelpItem icon="ads_click" title="Click a word">
                Clicking a detected word highlights it in the Extracted Text pane (and
                vice-versa) so you can line up the image with the text.
            </HelpItem>
            <HelpItem icon="zoom_in" title="Zoom & fit">
                Use the zoom buttons or slider to get a closer look — the readout is a
                percentage of the scan&rsquo;s own resolution, so 100% is actual size and
                as sharp as the page gets. The fit button resets the view to the whole
                page.
            </HelpItem>
            <HelpItem icon="description" title="Multi-page documents">
                For PDFs, use the page controls to move between pages. Each page is
                processed and formatted independently.
            </HelpItem>
        </>
    );
}

/**
 * `isMac` reaches the keyboard hints below, which name real keys and so differ
 * per platform — the pane already knows the answer, so it passes it in rather
 * than this re-deriving it from the user agent (see `lib/platform`).
 */
export function OutputHelp({ isMac = false }: { isMac?: boolean }): React.ReactElement {
    const key = (hint: string) => formatShortcut(hint, isMac);
    return (
        <>
            <p className="text-on-surface-variant">
                This pane shows the extracted content two ways: the raw detected text, and a
                structured table the AI builds from it.
            </p>
            <HelpItem icon="notes" title="Raw Text">
                The detected text in reading order. Hover or click a word to highlight it on
                the document image.
            </HelpItem>
            <HelpItem icon="content_copy" title="Copy">
                The Copy button copies all of the extracted text with clean spacing and line
                breaks.
            </HelpItem>
            <HelpItem icon="table" title="Format as Table">
                Sends the page to the local AI model, which organizes the text into rows and
                columns. The first run loads the model and can take a minute.
            </HelpItem>
            <HelpItem icon="ads_click" title="Source highlighting">
                Click any table cell to highlight the words it came from on the document.
                Cell colors show how confident the match is: green (high), amber (medium),
                red (low), and grey for cells with no verified source. Badges flag cells
                worth checking: "!" low confidence, "≈" approximate match, "?" no verified
                source, "✓" manually verified.
            </HelpItem>
            <HelpItem icon="checklist" title="Review flagged cells">
                The toolbar counts the cells worth a second look and steps through them:
                use the arrow buttons or {isMac ? '⌥←/→' : 'F3 (Shift+F3 to go back)'}; each
                step jumps to the cell's spot
                on the document. Fix a wrong value by editing it, or press Space (or the
                checkbox button) to mark a correct cell as checked. Resolved cells turn
                green with a ✓, and the toolbar shows "All cells reviewed" once the list
                is clear.
            </HelpItem>
            <HelpItem icon="edit" title="Edit a cell">
                Double-click a cell (or select it and press Enter or F2) to type a correction —
                or, with a single cell selected, just start typing to replace the value.
                Enter saves and moves down, Tab
                saves and moves right, Escape cancels. Edited cells count as checked, and
                your changes are saved and included in copies and exports. Arrow keys move
                between cells.
            </HelpItem>
            <HelpItem icon="select_all" title="Select several cells">
                Drag across cells, or hold Shift while clicking or pressing an arrow key,
                to select a block. Click a row number or column letter to take the whole
                row or column; {key('Ctrl+A')} takes the table. Space then marks every
                selected cell as checked at once, Delete clears them,
                and {key('Ctrl+C')} copies the block ({key('Ctrl+V')} pastes one back
                in, from here or from a spreadsheet).
            </HelpItem>
            <HelpItem icon="grid_on" title="Fix the table's shape">
                Right-click any cell — or a row number or column letter — for the table
                edits: insert or delete rows and columns, move them, join a value the AI
                split across two cells or columns, and shift a misaligned row left or
                right. The same commands live under "Edit table" in the toolbar. Every
                change can be undone with {key('Ctrl+Z')}.
            </HelpItem>
            <HelpItem icon="download" title="Export & re-extract">
                Export the finished table (e.g. CSV), or re-extract if the result looks off
                or a warning says rows may be missing.
            </HelpItem>
        </>
    );
}
