import React from 'react';
import DocumentViewer, { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../../components/DocumentViewer';
import type { DocumentViewerHandle } from '../../components/DocumentViewer';
import Icon from '../../components/Icon';
import { HelpOverlay } from '../../components/HelpOverlay';
import { WordEditModal } from '../../features/extraction/WordEditModal';
import type { DocumentPageResult } from '../../features/extraction/types';
import type { ProcessProgress } from '../../features/extraction/useDocumentExtraction';
import type { BoundingBox } from '../../features/ocr/types';
import { iconBtnClass } from './sessionToolbar';
import { SourceHelp } from './SessionHelp';

type EditingState = { box?: BoundingBox | null; id?: string; text?: string } | null;
type OverlayMode = 'all' | 'issues' | 'none';

const OVERLAY_MODES: { value: OverlayMode; label: string; description: string }[] = [
    { value: 'all', label: 'All regions', description: 'Show every detected region, color-coded by confidence' },
    { value: 'issues', label: 'Low confidence only', description: 'Dim high-confidence regions so only uncertain ones stand out' },
    { value: 'none', label: 'No overlay', description: 'Hide the confidence overlay entirely' },
];

// Dropdown for choosing which OCR-confidence regions are drawn on the source
// image. A dropdown (rather than a segmented control) scales to a third
// option without crowding the floating toolbar, and opens upward since this
// toolbar sits at the bottom of the pane.
function OverlayModeMenu({ mode, setMode }: { mode: OverlayMode; setMode: (mode: OverlayMode) => void }): React.ReactElement {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const current = OVERLAY_MODES.find(m => m.value === mode) ?? OVERLAY_MODES[0];

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-haspopup="true"
                aria-expanded={open}
                title="Choose which OCR-confidence regions are shown on the document"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface-variant px-3 text-sm text-on-surface transition-colors shadow-sm hover:bg-surface-container-high"
            >
                <Icon name="layers" size={16} />
                Overlay: {current.label}
                <Icon name="expand_more" size={14} className="leading-none" />
            </button>

            {open && (
                <div className="absolute bottom-full left-0 z-50 mb-1 min-w-64 rounded-xl border border-outline-variant bg-surface py-1 shadow-lg">
                    {OVERLAY_MODES.map(({ value, label, description }) => (
                        <button
                            key={value}
                            onClick={() => { setMode(value); setOpen(false); }}
                            aria-pressed={value === mode}
                            className="flex w-full items-start gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-variant"
                        >
                            <Icon name="check" size={16} className={`mt-0.5 shrink-0 ${value === mode ? 'text-primary' : 'invisible'}`} />
                            <span>
                                <span className="block font-medium text-on-surface">{label}</span>
                                <span className="block text-xs text-on-surface-variant">{description}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

interface SourceDocumentPaneProps {
    // Document processing / load state
    isDbLoading: boolean;
    showProcessing: boolean;
    processProgress: ProcessProgress | null;
    processingCancelled: boolean;
    dbError: string | null;
    cancelProcessing: () => void;
    retryProcessing: () => void;

    // Active page + viewer
    fileUrl: string | null;
    activePage: DocumentPageResult | undefined;
    viewerRef: React.RefObject<DocumentViewerHandle | null>;

    // Word editing
    addWord: (text: string, box: BoundingBox) => void;
    editWord: (id: string, text: string) => void;
    deleteWord: (id: string) => void;
    editingState: EditingState;
    setEditingState: (state: EditingState) => void;

    // Word highlighting / selection (links to the output pane)
    highlightedWordId: string | null;
    setHighlightedWordId: (id: string | null) => void;
    onWordClick: (wordId: string) => void;
    provenanceHighlightBox: BoundingBox | null;

    // Tool + viewport. Zoom is relative to the fitted size (1 = the image
    // exactly fits the pane); the viewer clamps it to [MIN_ZOOM, MAX_ZOOM].
    activeTool: 'draw' | 'pan';
    setActiveTool: (tool: 'draw' | 'pan') => void;
    zoom: number;
    setZoom: (zoom: number) => void;

    // OCR region overlay: 'all' shows every box, 'issues' dims high-confidence
    // ones to reduce clutter, 'none' hides the overlay entirely.
    overlayMode: OverlayMode;
    setOverlayMode: (mode: OverlayMode) => void;

    // Page navigation
    totalPages: number;
    activePageIndex: number;
    goToPage: (index: number) => void;
    pageInputValue: string;
    setPageInputValue: (value: string) => void;
}

export function SourceDocumentPane(props: SourceDocumentPaneProps): React.ReactElement {
    const {
        isDbLoading, showProcessing, processProgress, processingCancelled, dbError,
        cancelProcessing, retryProcessing,
        fileUrl, activePage, viewerRef,
        addWord, editWord, deleteWord, editingState, setEditingState,
        highlightedWordId, setHighlightedWordId, onWordClick, provenanceHighlightBox,
        activeTool, setActiveTool, zoom, setZoom,
        overlayMode, setOverlayMode,
        totalPages, activePageIndex, goToPage, pageInputValue, setPageInputValue,
    } = props;

    // A broken session: the page's cached image file is missing (the asset
    // protocol 403s), so the <img> fires onError. Track that here to swap the
    // viewer for a clear message instead of leaving a blank/broken pane.
    const [imageLoadFailed, setImageLoadFailed] = React.useState(false);

    const [helpOpen, setHelpOpen] = React.useState(false);

    // Reset whenever the source image changes (page switch, retry, or a new
    // session), so a prior failure doesn't stick to a freshly-loaded image.
    React.useEffect(() => {
        setImageLoadFailed(false);
    }, [fileUrl]);

    const commitPageInput = () => {
        const parsed = parseInt(pageInputValue, 10);
        if (!isNaN(parsed)) {
            goToPage(Math.min(Math.max(parsed - 1, 0), totalPages - 1));
        } else {
            setPageInputValue((activePageIndex + 1).toString());
        }
    };

    const handleSaveWord = (text: string) => {
        if (editingState?.id !== undefined) {
            editWord(editingState.id, text);
        } else if (editingState?.box) {
            addWord(text, editingState.box);
        }
        setEditingState(null);
    };

    return (
        <>
            <div className="mb-4 flex min-h-[40px] items-center justify-between">
                <h2 className="font-headline-md text-headline-md text-primary truncate">Source Document</h2>
                {activePage && (
                    <button
                        onClick={() => setHelpOpen(true)}
                        aria-label="About the source document tools"
                        title="Help"
                        type="button"
                        className={iconBtnClass}
                    >
                        <Icon name="info" size={18} />
                    </button>
                )}
            </div>
            <div className="relative flex-1 overflow-hidden rounded-2xl border border-outline-variant bg-surface-bright shadow-sm">
                {isDbLoading ? (
                    showProcessing ? (
                        <div className="flex w-full flex-col items-center justify-center gap-3 h-full text-on-surface-variant">
                            <Icon name="progress_activity" size={28} className="animate-spin" />
                            <span className="text-sm">
                                {processProgress
                                    ? `Processing page ${processProgress.current} of ${processProgress.total}…`
                                    : 'Processing…'}
                            </span>
                            <button
                                onClick={cancelProcessing}
                                className="mt-1 rounded-lg border border-outline-variant px-4 py-1 text-sm text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : null
                ) : processingCancelled ? (
                    <div className="flex w-full flex-col items-center justify-center gap-3 text-on-surface-variant h-full">
                        <Icon name="cancel" size={28} />
                        <p className="text-sm text-center max-w-sm">Processing was cancelled.</p>
                        <button onClick={retryProcessing} className="px-4 py-1 text-sm bg-primary text-on-primary rounded-lg hover:bg-primary/90">Process document</button>
                    </div>
                ) : dbError ? (
                    <div className="flex w-full flex-col items-center justify-center gap-3 text-error h-full">
                        <Icon name="error" size={28} />
                        <p className="text-sm text-center max-w-sm overflow-auto">{dbError}</p>
                        <button onClick={retryProcessing} className="px-4 py-1 text-sm bg-primary text-on-primary rounded-lg hover:bg-primary/90">Retry</button>
                    </div>
                ) : imageLoadFailed ? (
                    <div className="flex w-full flex-col items-center justify-center gap-3 text-error h-full">
                        <Icon name="broken_image" size={28} />
                        <p className="text-sm text-center max-w-sm overflow-auto">
                            The source image for this page could not be loaded. The file may have been moved or deleted.
                        </p>
                        <button onClick={retryProcessing} className="px-4 py-1 text-sm bg-primary text-on-primary rounded-lg hover:bg-primary/90">Retry document</button>
                    </div>
                ) : fileUrl && activePage ? (
                    <DocumentViewer
                        ref={viewerRef}
                        fileUrl={fileUrl}
                        words={activePage.words}
                        onAddWord={(box: BoundingBox) => setEditingState({ box })}
                        onEditRequest={(id: string, currentText: string) => setEditingState({ id, text: currentText })}
                        onDeleteRequest={deleteWord}
                        highlightedWordId={highlightedWordId}
                        setHighlightedWordId={setHighlightedWordId}
                        onWordClick={onWordClick}
                        activeTool={activeTool}
                        zoom={zoom}
                        onZoomChange={setZoom}
                        provenanceHighlightBox={provenanceHighlightBox}
                        onLoadError={() => setImageLoadFailed(true)}
                        overlayMode={overlayMode}
                    />
                ) : activePage?.error ? (
                    <div className="flex w-full flex-col items-center justify-center gap-3 text-error h-full">
                        <Icon name="broken_image" size={28} />
                        <p className="text-sm text-center max-w-sm">This page could not be processed: {activePage.error}</p>
                        <button onClick={retryProcessing} className="px-4 py-1 text-sm bg-primary text-on-primary rounded-lg hover:bg-primary/90">Retry document</button>
                    </div>
                ) : null}

                {editingState && (
                    <WordEditModal
                        initialData={editingState}
                        onSave={handleSaveWord}
                        onClose={() => setEditingState(null)}
                    />
                )}

                {/* Floating document toolbar — shown whenever a page is loaded
                    (even an errored one) so page navigation stays available; the
                    draw/zoom controls simply no-op without a rendered viewer. */}
                {activePage && !isDbLoading && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-wrap justify-center gap-2 px-4">
                        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                        {/* Draw/Pan Tool Toggle */}
                        <div className="flex shrink-0 bg-surface-variant rounded-lg p-1">
                            <button
                                onClick={() => setActiveTool('draw')}
                                aria-pressed={activeTool === 'draw'}
                                className={`flex h-7 items-center gap-1 px-3 rounded-md text-sm transition-colors ${activeTool === 'draw' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                            >
                                <Icon name="draw" size={16} />
                                Edit
                            </button>
                            <button
                                onClick={() => setActiveTool('pan')}
                                aria-pressed={activeTool === 'pan'}
                                className={`flex h-7 items-center gap-1 px-3 rounded-md text-sm transition-colors ${activeTool === 'pan' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                            >
                                <Icon name="pan_tool" size={16} />
                                Pan
                            </button>
                        </div>

                        <OverlayModeMenu mode={overlayMode} setMode={setOverlayMode} />

                        {totalPages > 1 && (
                            /* Page Navigation */
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    aria-label="Previous page"
                                    disabled={activePageIndex === 0}
                                    onClick={() => goToPage(activePageIndex - 1)}
                                    className={iconBtnClass}
                                    type="button"
                                >
                                    <Icon name="chevron_left" size={18} />
                                </button>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={pageInputValue}
                                    onChange={(e) => setPageInputValue(e.target.value)}
                                    onBlur={commitPageInput}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.currentTarget.blur(); }
                                        else if (e.key === 'Escape') { setPageInputValue((activePageIndex + 1).toString()); e.currentTarget.blur(); }
                                    }}
                                    className="h-8 w-9 text-center text-sm bg-surface-variant text-on-surface tabular-nums rounded-lg shadow-sm transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-text"
                                    aria-label="Page number"
                                />
                                <span className="text-sm text-on-surface-variant select-none whitespace-nowrap">/ {totalPages}</span>
                                <button
                                    aria-label="Next page"
                                    disabled={activePageIndex === totalPages - 1}
                                    onClick={() => goToPage(activePageIndex + 1)}
                                    className={iconBtnClass}
                                    type="button"
                                >
                                    <Icon name="chevron_right" size={18} />
                                </button>
                            </div>
                        )}

                        {/* Zoom Controls — zoom is relative to the fitted size, so
                            100% always means "fits the pane" and 50%/200% mean half/
                            double that, regardless of window size. */}
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                aria-label="Zoom out"
                                className={iconBtnClass}
                                disabled={zoom <= MIN_ZOOM}
                                onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
                                type="button"
                            >
                                <Icon name="zoom_out" size={18} fill={0} />
                            </button>

                            <input
                                type="range"
                                min={MIN_ZOOM}
                                max={MAX_ZOOM}
                                step="0.05"
                                value={zoom}
                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                className="hidden w-20 accent-primary cursor-pointer sm:block"
                                aria-label="Zoom level"
                            />
                            <span className="hidden w-10 select-none text-center text-xs tabular-nums text-on-surface-variant sm:block">
                                {Math.round(zoom * 100)}%
                            </span>

                            <button
                                aria-label="Zoom in"
                                className={iconBtnClass}
                                disabled={zoom >= MAX_ZOOM}
                                onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
                                type="button"
                            >
                                <Icon name="zoom_in" size={18} fill={0} />
                            </button>

                            <button
                                aria-label="Reset view"
                                className={iconBtnClass}
                                onClick={() => viewerRef.current?.fitToScreen()}
                                type="button"
                                title="Fit to screen"
                            >
                                <Icon name="fit_screen" size={18} fill={0} />
                            </button>
                        </div>
                        </div>
                    </div>
                )}
            </div>

            {helpOpen && (
                <HelpOverlay title="Source Document" onClose={() => setHelpOpen(false)}>
                    <SourceHelp />
                </HelpOverlay>
            )}
        </>
    );
}
