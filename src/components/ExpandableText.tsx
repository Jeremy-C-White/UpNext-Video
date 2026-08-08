import React, { useState } from "react";

interface ExpandableTextProps {
  text: string;
  className?: string;
  limit?: number;
}

export function ExpandableText({ text, className = "", limit = 120 }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!text) return null;

  const cleanText = text.replace(/<[^>]+>/g, ""); // Strip any HTML tags

  if (cleanText.length <= limit) {
    return <p className={className}>{cleanText}</p>;
  }

  return (
    <p
      className={`${className} cursor-pointer transition-colors relative z-20`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsExpanded(!isExpanded);
      }}
    >
      <span>{isExpanded ? cleanText : `${cleanText.slice(0, limit).trim()}...`}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsExpanded(!isExpanded);
        }}
        className="ml-2 text-orange-400 font-bold hover:text-orange-300 focus:outline-none inline-flex items-center text-[11px] tracking-wider uppercase bg-orange-500/10 px-1.5 py-0.5 rounded-md"
      >
        {isExpanded ? "Less" : "More"}
      </button>
    </p>
  );
}
