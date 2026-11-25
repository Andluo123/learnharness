"use client";

/** Visual math editor for the chat composer. A Σ button opens a MathLive
 *  what-you-see-is-what-you-get formula field; the finished LaTeX is inserted
 *  into the PathInput at the saved caret via INSERT_MATH_EVENT.
 *
 *  MathLive is loaded on first open only; fonts/JS ship with the package.
 *  The virtual keyboard stays OFF by default (mathVirtualKeyboardPolicy:
 *  "manual") so it never covers the composer/dialog; an explicit ⌨ button
 *  shows/hides it on demand. The field is re-created on every open so a
 *  close/reopen cycle always yields a fresh, editable mathfield.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/use-t.ts";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { INSERT_MATH_EVENT } from "@/components/path-input.tsx";

type MathfieldElement = HTMLElement & {
  value: string;
  mathVirtualKeyboardPolicy: string;
  smartFence: boolean;
  smartSuperscript: boolean;
  focus: () => void;
};


export function MathEditorButton({ editorRef }: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  const t = useT("composer");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fieldHost = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [inline, setInline] = useState(true);
  const [ready, setReady] = useState(false);
  const [keyboardOn, setKeyboardOn] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Load MathLive once; then create a FRESH mathfield on every open. A
  // previous implementation used a sticky `ready` flag, so after closing the
  // dialog the next open found an empty host and could not type at all.
  useEffect(() => {
    if (!open) {
      window.mathVirtualKeyboard?.hide();
      setReady(false);
      setKeyboardOn(false);
      return;
    }
    let cancelled = false;
    void import("mathlive").then(() => {
      if (cancelled || !fieldHost.current) return;
      const mf = document.createElement("math-field") as MathfieldElement;
      // Correct MathLive option name keeps the keyboard from auto-popping.
      // "manual" stops the keyboard auto-popping and covering the composer.
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.smartFence = true;
      mf.smartSuperscript = true;
      mf.setAttribute("style", "font-size: 20px; min-height: 56px; width: 100%;");
      fieldHost.current.replaceChildren(mf);
      mf.focus();
      setReady(true);
    }).catch(() => { /* MathLive unavailable — the button simply does nothing. */ });
    return () => { cancelled = true; window.mathVirtualKeyboard?.hide(); };
  }, [open]);

  // Toggle the on-screen keyboard explicitly (never automatic).
  const toggleKeyboard = useCallback(() => {
    const kb = window.mathVirtualKeyboard;
    if (!kb) return;
    if (kb.visible) { kb.hide(); setKeyboardOn(false); }
    else { kb.show(); setKeyboardOn(true); }
  }, []);

  // Track MathLive's on-screen keyboard height so the dialog can ride ABOVE
  // it instead of being covered (keyboard has z-index 105). Events fire on
  // show/hide and on geometry (resize) changes.
  useEffect(() => {
    const kb = window.mathVirtualKeyboard;
    if (!open || !ready || !kb) { setKeyboardHeight(0); return; }
    const sync = () => setKeyboardHeight(kb.visible ? kb.boundingRect.height : 0);
    sync();
    kb.addEventListener("virtual-keyboard-toggle", sync);
    kb.addEventListener("geometrychange", sync);
    return () => {
      kb.removeEventListener("virtual-keyboard-toggle", sync);
      kb.removeEventListener("geometrychange", sync);
    };
  }, [open, ready]);

  const close = useCallback(() => {
    window.mathVirtualKeyboard?.hide();
    setKeyboardOn(false);
    setOpen(false);
  }, []);

  // Close on outside pointer-down or Escape; hide the keyboard whenever the
  // dialog goes away so it can never linger over the composer.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (fieldHost.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target)) return;
      // MathLive portals its virtual keyboard to document.body — OUTSIDE the
      // dialog. Clicking a key there must NOT be treated as an outside click.
      if (event.target instanceof Element && event.target.closest(".ML__keyboard, .ML__virtual-keyboard")) return;
      close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);

  const insert = useCallback(() => {
    const mf = fieldHost.current?.querySelector("math-field") as MathfieldElement | null;
    const tex = mf?.value?.trim();
    const editor = editorRef.current;
    if (!tex || !editor?.isConnected) return;
    editor.dispatchEvent(new CustomEvent(INSERT_MATH_EVENT, { detail: { tex, inline } }));
    close();
  }, [editorRef, inline, close]);

  return <>
    <Hint label={t("insertMath")}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("insertMath")}
        aria-expanded={open}
        data-testid="math-editor-button"
        onClick={() => setOpen(v => !v)}
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="font-serif text-lg leading-none">∑</span>
      </button>
    </Hint>
    {open && typeof document !== "undefined" && createPortal(
      <div
        role="dialog"
        aria-label={t("mathEditorTitle")}
        style={{ bottom: keyboardHeight > 0 ? keyboardHeight + 16 : 96 }}
        className="fixed left-1/2 z-[200] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-border bg-background p-3 shadow-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t("mathEditorTitle")}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={toggleKeyboard} aria-label={t("mathToggleKeyboard")} className={cn("rounded px-2 py-0.5 text-xs", keyboardOn ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>⌨</button>
            <button type="button" onClick={() => setInline(true)} className={cn("rounded px-2 py-0.5 text-xs", inline ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{t("mathInline")}</button>
            <button type="button" onClick={() => setInline(false)} className={cn("rounded px-2 py-0.5 text-xs", !inline ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{t("mathBlock")}</button>
          </div>
        </div>
        <div className="relative min-h-14 rounded-lg border border-border bg-secondary/30 p-2 text-foreground">
          {!ready && <span className="absolute inset-2 flex items-center text-xs text-muted-foreground">{t("mathEditorLoading")}</span>}
          {/* React must NOT own children of fieldHost: MathLive's replaceChildren()
              would remove them and React's later removeChild would throw. */}
          <div ref={fieldHost} className="min-h-10 w-full" />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-accent">{t("mathCancel")}</button>
          <button type="button" onClick={insert} data-testid="math-editor-insert" className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90">{t("mathInsert")}</button>
        </div>
      </div>,
      document.body,
    )}
  </>;
}
