const paths: Record<string, string> = {
 road: '<path d="m5 21 4-18m6 0 4 18M12 4v3m0 4v3m0 4v3"/>',
 bridge: '<path d="M3 17h18M5 17V7m14 10V7M5 8c4 7 10 7 14 0M8 12v5m8-5v5"/>',
 erase: '<path d="m15 3 6 6-12 12H5l-3-3L15 3ZM9 9l7 7M9 21h12"/>',
 portal: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>',
 select: '<path d="m5 3 14 9-7 1-3 7-4-17Z"/>',
 play: '<path d="m9 5 11 7-11 7V5Z"/>',
 pause: '<path d="M9 5v14m6-14v14"/>',
 plus: '<path d="M12 5v14M5 12h14"/>',
 minus: '<path d="M5 12h14"/>',
 reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
 arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
 save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
 folder: '<path d="M3 7V4h7l2 3h9v13H3V7Z"/>',
 grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
 close: '<path d="m6 6 12 12M6 18 18 6"/>',
 help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',
 check: '<path d="m5 12 4 4L19 6"/>',
 trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l6-6m-6 6 6 6"/>',
 flow: '<path d="M3 6h11a5 5 0 0 1 0 10H8m0 0 4-4m-4 4 4 4M3 6l4-4M3 6l4 4"/>',
 expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 edit: '<path d="m15 3 6 6-12 12H3v-6L15 3Zm-3 3 6 6"/>',
 flag: '<path d="M5 22V3c5-4 9 4 15 0v12c-6 4-10-4-15 0"/>'
};
export function icon(name: string, cls = ''): string {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.road}</svg>`;
}
