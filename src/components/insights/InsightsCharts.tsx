
import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    BarChart,
    Bar,
} from 'recharts';

type DailyStats = {
    date: string;
    cycleTime: number;
    mergeCount: number;
    reviewTime: number;
    commitCount?: number;
};

interface InsightsChartsProps {
    data: DailyStats[];
}

export const InsightsCharts: React.FC<InsightsChartsProps> = ({ data }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Cycle Time Chart */}
            <div className="bg-card border rounded-lg p-6 shadow-sm overflow-hidden">
                <h3 className="text-lg font-semibold mb-4">Cycle Time (Hours)</h3>
                <p className="text-sm text-muted-foreground mb-6">Average time from Creation to Merge</p>
                <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            />
                            <YAxis />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                                itemStyle={{ color: 'hsl(var(--primary))' }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="cycleTime"
                                name="Avg Cycle Hours"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Deployment Frequency Chart */}
            <div className="bg-card border rounded-lg p-6 shadow-sm overflow-hidden">
                <h3 className="text-lg font-semibold mb-4">Deployment Frequency</h3>
                <p className="text-sm text-muted-foreground mb-6">Number of PRs merged per day</p>
                <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            />
                            <YAxis allowDecimals={false} />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                            />
                            <Legend />
                            <Bar
                                dataKey="mergeCount"
                                name="Merged PRs"
                                fill="hsl(var(--chart-2))"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Commit Activity Chart */}
            <div className="bg-card border rounded-lg p-6 shadow-sm overflow-hidden md:col-span-2 lg:col-span-1">
                <h3 className="text-lg font-semibold mb-4">Commit Activity</h3>
                <p className="text-sm text-muted-foreground mb-6">Number of commits per day</p>
                <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            />
                            <YAxis allowDecimals={false} />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                            />
                            <Legend />
                            <Bar
                                dataKey="commitCount"
                                name="Commits"
                                fill="hsl(var(--chart-3))"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
