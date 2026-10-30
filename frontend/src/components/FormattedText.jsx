import React from 'react';
import { splitParagraphs } from '../utils/formatText';

export default function FormattedText({ text, className = 'prose' }) {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return null;
  return (
    <div className={className}>
      {paragraphs.map((lines, i) => (
        <p key={i}>
          {lines.map((line, j) => (
            <React.Fragment key={j}>
              {j > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
