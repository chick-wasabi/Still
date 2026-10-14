import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
export default function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const reduced = useReducedMotion();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() =>
      (
        ref.current.querySelector('[autofocus], input:not([disabled]), textarea, select') ||
        ref.current
      ).focus(),
    );
    function keydown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = [
        ...ref.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]',
        ),
      ].filter((item) => item.getClientRects().length);
      if (!items.length) {
        event.preventDefault();
        ref.current.focus();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === ref.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    const shell = document.querySelector('.workspace-shell');
    if (shell) shell.inert = true;
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      if (shell) shell.inert = false;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={reduced ? false : { opacity: 0, x: wide ? 24 : 0, y: wide ? 0 : 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className={`modal ${wide ? 'editor-modal' : ''}`}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {children}
      </motion.section>
    </div>,
    document.body,
  );
}
