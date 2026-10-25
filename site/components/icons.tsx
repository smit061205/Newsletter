// The site's line icons (22px, stroke = currentColor).
const P = { className: "i", viewBox: "0 0 24 24", "aria-hidden": true } as const;
export const Chev = () => <svg {...P}><path d="M9 6l6 6-6 6" /></svg>;
export const MenuIcon = () => <svg {...P}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const SearchIcon = () => <svg {...P}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>;
export const CloseIcon = () => <svg {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const WhatsApp = () => (
  <svg {...P}><path d="M4 20l1.4-4.2A8 8 0 1 1 8.3 18.7z" /><path d="M9.2 9.3c.3 1.9 2.4 4 4.5 4.5l1-1.1 1.8.8c-.2 1-1 1.7-2 1.7-3.2-.2-6.2-3.2-6.4-6.4 0-1 .7-1.8 1.7-2l.8 1.8z" /></svg>
);
export const SaveIcon = ({ on }: { on?: boolean }) => <svg {...P}><path d="M6 3h12v18l-6-4-6 4z" fill={on ? "currentColor" : "none"} /></svg>;
export const Check = () => <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></svg>;
export const Flag = () => <svg {...P}><path d="M5 21V4h12l-2 4 2 4H5" /></svg>;
export const LinkIcon = () => <svg {...P}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></svg>;
export const TextSize = () => <svg {...P}><path d="M3 18l4-11 4 11M4.5 14h5M13 18l3.5-9 3.5 9M14.2 15h4.6" /></svg>;
export const HomeIcon = () => <svg {...P}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>;
export const Clock = () => <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
export const Paper = () => <svg {...P}><path d="M5 4h11l3 3v13H5z" /><path d="M8 9h8M8 12.5h8M8 16h5" /></svg>;
export const Archive = () => <svg {...P}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></svg>;
