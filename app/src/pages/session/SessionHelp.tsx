import React from 'react';
import { HelpItem } from '../../components/HelpOverlay';

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
                Use the zoom buttons or slider to get a closer look; the fit button resets
                the view to the whole page.
            </HelpItem>
            <HelpItem icon="description" title="Multi-page documents">
                For PDFs, use the page controls to move between pages. Each page is
                processed and formatted independently.
            </HelpItem>
        </>
    );
}

export function OutputHelp(): React.ReactElement {
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
                Cell colors show how confident the match is — green (high), amber (medium),
                red (low), and grey for cells with no verified source. Badges flag cells
                worth checking: "!" low confidence, "≈" approximate match, "?" no verified
                source, "✓" manually verified.
            </HelpItem>
            <HelpItem icon="checklist" title="Review flagged cells">
                The toolbar counts the cells worth a second look and steps through them —
                use the arrow buttons or the ←/→ keys; each step jumps to the cell's spot
                on the document. Fix a wrong value by editing it, or press Space (or the
                checkbox button) to mark a correct cell as verified. Resolved cells turn
                green with a ✓, and the toolbar shows "All cells reviewed" once the list
                is clear — after that, ←/→ walk every cell.
            </HelpItem>
            <HelpItem icon="edit" title="Edit a cell">
                Double-click a cell (or select it and press Enter) to type a correction.
                Enter saves it, Escape cancels. Edited cells count as manually verified,
                and your changes are saved and included in copies and exports. Use ↑/↓ to
                move between rows while reviewing.
            </HelpItem>
            <HelpItem icon="download" title="Export & re-extract">
                Export the finished table (e.g. CSV), or re-extract if the result looks off
                or a warning says rows may be missing.
            </HelpItem>
        </>
    );
}
