"use client";

/**
 * Chart Components using Recharts
 */

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";

interface RiskDistributionChartProps {
  data: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
}

export function RiskDistributionChart({ data }: RiskDistributionChartProps) {
  const chartData = [
    { name: "Critical", value: data.CRITICAL, fill: "#dc2626" }, // red-600
    { name: "High", value: data.HIGH, fill: "#f97316" }, // orange-500
    { name: "Medium", value: data.MEDIUM, fill: "#eab308" }, // yellow-500
    { name: "Low", value: data.LOW, fill: "#22c55e" }, // green-500
  ];

  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Risk distribution
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        How many risks fall into each severity bucket.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: ${value}`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EventTypeChartProps {
  data: Record<string, number>;
}

export function EventTypeChart({ data }: EventTypeChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name: name || "Unknown",
    count: value,
  }));

  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Event types</h3>
      <p className="text-xs text-gray-500 mb-4">
        What the classifier thinks is happening.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ConnectorLatencyChartProps {
  data: Array<{ name: string; latency: number }>;
}

export function ConnectorLatencyChart({ data }: ConnectorLatencyChartProps) {
  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Connector latency
      </h3>
      <p className="text-xs text-gray-500 mb-4">Average poll latency (ms).</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="latency" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface RiskTrendChartProps {
  data: Array<{ time: string; count: number; avgScore: number }>;
}

export function RiskTrendChart({ data }: RiskTrendChartProps) {
  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Risk trend
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Count and average score over time.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="count"
            stroke="#ef4444"
            name="Risk Count"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgScore"
            stroke="#3b82f6"
            name="Avg Score"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
