import type { ChangeEvent } from 'react';

interface Props {
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void; // optional: disabled fields have none
  className?: string;
  disabled?: boolean;
}

// Time input where the native wheel picker is the ONLY way to set a value:
// keyboard typing, paste, and drag-drop are all blocked; the UA picker (clock
// icon / click) still sets the value normally. (K-19)
export function AdminTimeInput({ value, onChange, className, disabled }: Props) {
  const openPicker = (el: HTMLInputElement) => {
    // Clicking anywhere on the field opens the wheel picker directly (not just the tiny clock icon).
    try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* older browsers: clock icon still works */ }
  };
  return (
    <input
      type="time"
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      // Block typing (allow Tab so keyboard focus navigation still works):
      onKeyDown={(e) => { if (e.key !== 'Tab') e.preventDefault(); }}
      onPaste={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      onClick={(e) => { if (!disabled) openPicker(e.currentTarget); }}
    />
  );
}
