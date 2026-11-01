"use client";
import { useState } from 'react';

const ITEMS = [
  {
    q: 'How long does it take to set up?',
    a: 'Create your academy account, add your players and squads, and you\'re tracking attendance and fees the same day. No onboarding calls or spreadsheet migration required to get started.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. It runs in the browser on your phone, tablet, or laptop — mark attendance pitch-side, check fee status between sessions, nothing to download.',
  },
  {
    q: 'Can I try it before paying?',
    a: 'Book a demo and we\'ll walk you through the platform on your own academy\'s data before you commit to Pro or Enterprise.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your academy\'s data stays yours. You can export players, fee records, and attendance history at any time.',
  },
  {
    q: 'Does it work for more than one sport?',
    a: 'Yes — the same account handles football, cricket, or a multi-sport club with several squads and grounds running at once.',
  },
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="faq-list">
      {ITEMS.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div className={"faq-item" + (isOpen ? ' open' : '')} key={item.q}>
            <button
              type="button"
              className="faq-question"
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span>{item.q}</span>
              <span className="faq-icon" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            <div className="faq-answer" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
