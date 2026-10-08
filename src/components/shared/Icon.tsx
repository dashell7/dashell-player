import React from 'react';

/**
 * Unified SVG icon component — Lucide-style stroked icons consistent with Obsidian
 * All icons use stroke-based rendering for visual consistency
 */

const ICONS: Record<string, string> = {
  // Player
  'play': 'M5 3l14 9-14 9V3z',
  'pause': 'M6 4h4v16H6zM14 4h4v16h-4z',
  'skip-back': 'M19 20L9 12l10-8v16zM5 19V5',
  'skip-forward': 'M5 4l10 8-10 8V4zM19 5v14',
  'repeat': 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  'gauge': 'M12 14l4-4M3.34 19a10 10 0 1117.32 0M7 19h10M12 4v2',
  'mic': 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8',
  'volume-2': 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07',

  // General
  'x': 'M18 6L6 18M6 6l12 12',
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  'check': 'M20 6L9 17l-5-5',
  'search': 'M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.35-4.35',
  'settings': 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z',
  'refresh-cw': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  'download': 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  'upload': 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  'trash-2': 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6',
  'edit-2': 'M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  'external-link': 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',

  // Content
  'book-open': 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
  'rss': 'M4 11a9 9 0 019 9M4 4a16 16 0 0116 16M5 20a1 1 0 100-2 1 1 0 000 2z',
  'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  'star-off': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  'bookmark': 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z',
  'file-text': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  'save': 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8',
  'clipboard': 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z',

  // Stats
  'bar-chart-2': 'M18 20V10M12 20V4M6 20v-6',
  'trending-up': 'M23 6l-9.5 9.5-5-5L1 18',

  // Media
  'film': 'M2 2h20v20H2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5',
  'music': 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z',
  'headphones': 'M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z',

  // Arrows
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',

  // Folder/Nav
  'folder': 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  'folder-open': 'M2 19V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v1M2 19l2.56-7.68A2 2 0 016.46 10H21.5a1.5 1.5 0 011.42 2.02L20.72 19a2 2 0 01-1.9 1.37H4a2 2 0 01-2-1.37z',
  'folder-plus': 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11zM12 11v6M9 14h6',
  'globe': 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z',
  'move': 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  'maximize': 'M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3',
  'minimize': 'M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3',

  // Import/Export
  'import': 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  'export': 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',

  // Info
  'loader': 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  'info': 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 16v-4M12 8h.01',
  'alert-circle': 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8v4M12 16h.01',

  // Recording
  'square': 'M3 3h18v18H3z',
  // Free speech: mic with outgoing waveform lines
  'mic-lines': 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8M20 5h3M21 9h2M20 13h3',
  'volume': 'M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07',
  'volume-x': 'M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',

  // Subtitle / Panel
  'eye': 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
  'eye-off': 'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22',
  'panel-right': 'M18 3h4v18h-4zM2 3h16v18H2z',
  'panel-left': 'M2 3h4v18H2zM6 3h16v18H6z',
  'panel-left-close': 'M2 3h4v18H2zM6 3h16v18H6zM14 9l-3 3 3 3',

  // Vocabulary
  'help-circle': 'M12 2a10 10 0 100 20 10 10 0 000-20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01',
  'circle': 'M12 2a10 10 0 100 20 10 10 0 000-20z',
  'check-circle': 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  'credit-card': 'M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2zM1 10h22',
  'type': 'M4 7V4h16v3M9 20h6M12 4v16',
  'latin-a': 'M5 20L12 4l7 16M8 14h8',
  'hanzi': 'M12 3v3M5 7h14M7 10l10 10M17 10L7 20M12 7v2',
  'clock': 'M12 22a10 10 0 110-20 10 10 0 010 20zM12 6v6l4 2',
  'languages': 'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2v3M22 22l-5-10-5 10M14 18h6',
  'captions': 'M3 4h18v16H3zM7 10h4M9 7v6M14 10h4M14 14h4',
  'captions-original': 'M3 4h18v16H3zM7 16l3-9 3 9M8 13h4',
  'captions-bilingual': 'M3 4h18v16H3zM6 10h5M8.5 7.5v5M6 15h5M14 9h4M14 14h4',
  'keyboard': 'M2 5h20v14H2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 15h8',
};

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 16, className, style }: IconProps) {
  const path = ICONS[name];
  if (!path) {
    return <span className={`lp-icon-placeholder ${className ?? ''}`} style={{ width: size, height: size, ...style }} />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lp-icon ${className ?? ''}`}
      style={style}
    >
      <path d={path} />
    </svg>
  );
}
