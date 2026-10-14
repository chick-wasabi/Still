import React from 'react';
import ReactMarkdown from 'react-markdown';
export default function MarkdownPreview({ body }) {
  return <ReactMarkdown>{body || '*Your words will appear here.*'}</ReactMarkdown>;
}
