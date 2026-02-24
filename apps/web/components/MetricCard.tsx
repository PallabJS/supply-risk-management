/**
 * Metric Cards Components
 */

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon?: React.ReactNode;
  color?: "red" | "yellow" | "green" | "blue";
}

function getColorClasses(color?: string) {
  switch (color) {
    case "red":
      return "border-red-200 bg-red-50";
    case "yellow":
      return "border-yellow-200 bg-yellow-50";
    case "green":
      return "border-green-200 bg-green-50";
    case "blue":
      return "border-blue-200 bg-blue-50";
    default:
      return "border-gray-200 bg-white";
  }
}

function getTextColorClasses(color?: string) {
  switch (color) {
    case "red":
      return "text-red-700";
    case "yellow":
      return "text-yellow-700";
    case "green":
      return "text-green-700";
    case "blue":
      return "text-blue-700";
    default:
      return "text-gray-700";
  }
}

export function MetricCard({
  title,
  value,
  unit = "",
  subtext,
  icon,
  color,
}: MetricCardProps) {
  return (
    <div
      className={`border rounded-lg p-6 ${getColorClasses(
        color,
      )} flex items-start gap-4`}
    >
      {icon && <div className="text-3xl flex-shrink-0">{icon}</div>}
      <div className="flex-1">
        <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
        <div className={`text-2xl font-bold ${getTextColorClasses(color)}`}>
          {value}
          {unit && <span className="text-lg ml-1">{unit}</span>}
        </div>
        {subtext && <p className="text-xs text-gray-500 mt-2">{subtext}</p>}
      </div>
    </div>
  );
}

export function MetricsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {children}
    </div>
  );
}
