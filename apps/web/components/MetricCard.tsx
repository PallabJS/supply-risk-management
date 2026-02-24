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
  trend?: {
    label: string;
    direction?: "up" | "down" | "flat";
  };
}

function getColorClasses(color?: string) {
  switch (color) {
    case "red":
      return "border-red-200/70 bg-gradient-to-br from-red-50 to-white";
    case "yellow":
      return "border-yellow-200/70 bg-gradient-to-br from-yellow-50 to-white";
    case "green":
      return "border-green-200/70 bg-gradient-to-br from-green-50 to-white";
    case "blue":
      return "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white";
    default:
      return "border-gray-200/70 bg-white";
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
  trend,
}: MetricCardProps) {
  return (
    <div
      className={`group border rounded-2xl p-6 ${getColorClasses(
        color,
      )} shadow-sm hover:shadow-md transition-all duration-300 flex items-start gap-4 animate-fade-in-up`}
    >
      {icon && (
        <div className="text-3xl flex-shrink-0 select-none transition-transform duration-300 group-hover:scale-105">
          {icon}
        </div>
      )}
      <div className="flex-1">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
          {trend && (
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full border ${
                trend.direction === "up"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : trend.direction === "down"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-gray-200 bg-gray-50 text-gray-700"
              }`}
            >
              {trend.label}
            </span>
          )}
        </div>
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
