"use client";
import { useState, useEffect, useRef } from 'react';
import './ThemeSwitcher.css';

const ACCENTS = [
  { key: 'lime', name: 'Lime', color: '#baf24b' },
  { key: 'teal', name: 'Teal', color: '#2dd4bf' },
  { key: 'amber', name: 'Amber', color: '#f5a623' },
  { key: 'red', name: 'Red', color: '#f0596b' },
  { key: 'emerald', name: 'Emerald', color: '#34d399' },
  { key: 'sapphire', name: 'Sapphire', color: '#3b82f6' },
  { key: 'violet', name: 'Violet', color: '#8b5cf6' },
  { key: 'rose', name: 'Rose', color: '#ec4899' },
  { key: 'slate', name: 'Slate', color: '#64748b' },
  { key: 'navy', name: 'Navy', color: '#3f5f8a' },
  { key: 'forest', name: 'Forest', color: '#3f8a63' },
  { key: 'maroon', name: 'Maroon', color: '#a13d5c' },
];

export default function ThemeSwitcher({ mode: controlledMode, onModeChange, compact = false } = {}) {
  const isModeControlled = controlledMode !== undefined;
  const [open, setOpen] = useState(false);
  const [internalMode, setInternalMode] = useState('dark');
  const [accent, setAccent] = useState('lime');
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const mode = isModeControlled ? controlledMode : internalMode;

  useEffect(() => {
    const savedAccent = localStorage.getItem('ams_theme_accent') || 'lime';
    setAccent(savedAccent);
    if (isModeControlled) return;
    const savedMode = localStorage.getItem('ams_theme_mode') || 'dark';
    setInternalMode(savedMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isModeControlled) return;
    document.documentElement.setAttribute('data-theme', internalMode);
    localStorage.setItem('ams_theme_mode', internalMode);
  }, [internalMode, isModeControlled]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('ams_theme_accent', accent);
  }, [accent]);

  const setMode = (next) => {
    if (isModeControlled) {
      onModeChange && onModeChange(next);
    } else {
      setInternalMode(next);
    }
  };

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const activeColor = ACCENTS.find(a => a.key === accent)?.color || '#baf24b';

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 260;
      const margin = 12;
      const left = Math.max(margin, Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - margin));
      const top = Math.min(rect.bottom + 10, window.innerHeight - margin);
      setPopPos({ top, left });
    }
    setOpen(o => !o);
  };

  return (
    <div className={"theme-switcher" + (compact ? ' compact' : '')} ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="theme-trigger"
        onClick={toggleOpen}
        aria-label="Theme settings"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C22 6.012 17.461 2 12 2z" />
        </svg>
        <span className="theme-trigger-dot" style={{ background: activeColor }} />
      </button>

      {open && (
        <div
          className="theme-popover"
          role="dialog"
          aria-label="Theme settings"
          style={{ top: popPos.top, left: popPos.left }}
        >
          <div className="tp-label">Mode</div>
          <div className="tp-mode-toggle">
            <button
              type="button"
              className={mode === 'light' ? 'active' : ''}
              onClick={() => setMode('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={mode === 'dark' ? 'active' : ''}
              onClick={() => setMode('dark')}
            >
              Dark
            </button>
          </div>

          <div className="tp-label">Accent</div>
          <div className="tp-accents">
            {ACCENTS.map(a => (
              <button
                key={a.key}
                type="button"
                className="tp-accent"
                onClick={() => setAccent(a.key)}
                aria-label={a.name}
                aria-pressed={accent === a.key}
              >
                <span
                  className={"tp-swatch" + (accent === a.key ? ' active' : '')}
                  style={{
                    background: a.color,
                    boxShadow: accent === a.key ? `0 0 0 2px var(--bg-raised), 0 0 0 4px ${a.color}` : 'none',
                  }}
                >
                  {accent === a.key && (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0a0f0d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="tp-swatch-name">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
