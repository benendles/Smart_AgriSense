interface ProgressBarProps {
  value: number; // 0–1
  color?: string; // Tailwind bg-* class
  height?: string; // Tailwind h-* class
}

export default function ProgressBar({
  value,
  color = "bg-primary-500",
  height = "h-2",
}: ProgressBarProps) {
  const pct = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <div className={`w-full bg-gray-200 rounded-full ${height} overflow-hidden`}>
      <div
        className={`${height} rounded-full progress-fill ${color}`}
        // CSS variable is the accepted pattern for dynamic values in Tailwind projects.
        // eslint-disable-next-line react/forbid-dom-props
        style={{ "--bar-fill": pct } as React.CSSProperties}
      />
    </div>
  );
}
