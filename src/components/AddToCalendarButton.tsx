import { useState } from "react";
import { Plus, Calendar, ExternalLink } from "lucide-react";

interface AddToCalendarButtonProps {
  showName: string;
  season: number;
  number: number;
  epTitle: string;
  airstamp: string;
  runtimeMinutes?: number;
}

export function AddToCalendarButton({
  showName,
  season,
  number,
  epTitle,
  airstamp,
  runtimeMinutes
}: AddToCalendarButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const handleAction = (e: React.MouseEvent, type: 'google' | 'ics') => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);

    try {
      const startDate = new Date(airstamp);
      if (isNaN(startDate.getTime())) return;
      const endDate = new Date(startDate.getTime() + (runtimeMinutes || 60) * 60 * 1000);

      const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const dtStart = formatICSDate(startDate);
      const dtEnd = formatICSDate(endDate);

      const title = `${showName} - S${season} E${number}: ${epTitle}`;
      const description = `Watch ${showName} S${season} E${number} (${epTitle})`;

      if (type === 'google') {
        const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dtStart}/${dtEnd}&details=${encodeURIComponent(description)}`;
        window.open(gcalUrl, '_blank', 'noopener,noreferrer');
        setStatusText("Opened!");
        setTimeout(() => setStatusText(null), 2000);
        return;
      }

      // .ICS File Download
      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//NextUp//EN',
        'BEGIN:VEVENT',
        `SUMMARY:${title}`,
        `DESCRIPTION:${description}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${showName.replace(/[^a-zA-Z0-9]/g, '_')}_S${season}E${number}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatusText("Downloaded!");
      setTimeout(() => setStatusText(null), 2000);
    } catch (err) {
      console.error("Calendar export error:", err);
    }
  };

  return (
    <div className="relative inline-block text-left z-30">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors border border-slate-200/50 dark:border-slate-700/50 active:scale-95 touch-manipulation"
      >
        <Plus className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
        <span>{statusText || "Add to Calendar"}</span>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsOpen(false);
            }} 
          />
          <div 
            className="absolute left-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-slate-800 dark:text-slate-200 text-xs font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <button
              type="button"
              onClick={(e) => handleAction(e, 'google')}
              className="w-full px-3.5 py-2 text-left hover:bg-orange-500/10 hover:text-orange-500 flex items-center gap-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>Google Calendar</span>
            </button>
            <button
              type="button"
              onClick={(e) => handleAction(e, 'ics')}
              className="w-full px-3.5 py-2 text-left hover:bg-orange-500/10 hover:text-orange-500 flex items-center gap-2 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Download .ICS File</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
