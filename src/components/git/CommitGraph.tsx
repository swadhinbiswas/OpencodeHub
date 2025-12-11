import { useMemo, useState } from "react"

interface Commit {
  sha: string
  shortSha: string
  message: string
  author: {
    name: string
    email: string
    avatar?: string
  }
  date: string
  timestamp: number
  parents: string[]
  branch?: string
  tags?: string[]
  refs?: string[]
}

interface CommitGraphProps {
  commits: Commit[]
  branches: string[]
  onCommitClick?: (commit: Commit) => void
  onBranchClick?: (branch: string) => void
}

// Color palette for branches
const branchColors = [
  "#2ecc71", // green
  "#3498db", // blue
  "#9b59b6", // purple
  "#e74c3c", // red
  "#f1c40f", // yellow
  "#1abc9c", // teal
  "#e67e22", // orange
  "#95a5a6", // gray
]

export function CommitGraph({
  commits,
  branches,
  onCommitClick,
  onBranchClick,
}: CommitGraphProps) {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null)

  // Calculate graph layout
  const graphData = useMemo(() => {
    const columns: Map<string, number> = new Map()
    const branchHeads: Map<string, string> = new Map()
    const commitColumns: Map<string, number> = new Map()
    const connections: Array<{
      from: { row: number; col: number }
      to: { row: number; col: number }
      color: string
    }> = []

    let maxColumn = 0

    // Assign columns to branches
    branches.forEach((branch, index) => {
      columns.set(branch, index)
      maxColumn = Math.max(maxColumn, index)
    })

    // Process commits
    commits.forEach((commit, index) => {
      // Find which column this commit belongs to
      let col = 0
      if (commit.branch) {
        col = columns.get(commit.branch) || 0
      } else {
        // Find an available column
        col = maxColumn + 1
        maxColumn = col
      }
      commitColumns.set(commit.sha, col)

      // Create connections to parents
      commit.parents.forEach((parentSha) => {
        const parentIndex = commits.findIndex((c) => c.sha === parentSha)
        if (parentIndex !== -1) {
          const parentCol = commitColumns.get(parentSha) || col
          connections.push({
            from: { row: index, col },
            to: { row: parentIndex, col: parentCol },
            color: branchColors[col % branchColors.length],
          })
        }
      })
    })

    return {
      commitColumns,
      connections,
      maxColumn,
    }
  }, [commits, branches])

  const handleCommitClick = (commit: Commit) => {
    setSelectedCommit(commit.sha)
    onCommitClick?.(commit)
  }

  const rowHeight = 36
  const columnWidth = 16
  const nodeRadius = 5
  const graphWidth = (graphData.maxColumn + 2) * columnWidth

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-3">
        <h3 className="font-semibold">Commit History</h3>
        <div className="flex items-center gap-2">
          {branches.slice(0, 5).map((branch, index) => (
            <button
              key={branch}
              onClick={() => onBranchClick?.(branch)}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${branchColors[index % branchColors.length]}20`,
                color: branchColors[index % branchColors.length],
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: branchColors[index % branchColors.length] }}
              />
              {branch}
            </button>
          ))}
          {branches.length > 5 && (
            <span className="text-xs text-muted-foreground">+{branches.length - 5} more</span>
          )}
        </div>
      </div>

      {/* Graph */}
      <div className="relative overflow-x-auto">
        <div className="flex">
          {/* Graph Column */}
          <div
            className="flex-shrink-0 border-r bg-muted/10"
            style={{ width: graphWidth }}
          >
            <svg
              width={graphWidth}
              height={commits.length * rowHeight}
              className="block"
            >
              {/* Draw connections */}
              {graphData.connections.map((conn, i) => {
                const x1 = conn.from.col * columnWidth + columnWidth / 2 + 4
                const y1 = conn.from.row * rowHeight + rowHeight / 2
                const x2 = conn.to.col * columnWidth + columnWidth / 2 + 4
                const y2 = conn.to.row * rowHeight + rowHeight / 2

                // Create curved path for merge commits
                const path =
                  x1 === x2
                    ? `M ${x1} ${y1} L ${x2} ${y2}`
                    : `M ${x1} ${y1} C ${x1} ${y1 + (y2 - y1) / 2} ${x2} ${y1 + (y2 - y1) / 2} ${x2} ${y2}`

                return (
                  <path
                    key={i}
                    d={path}
                    stroke={conn.color}
                    strokeWidth={2}
                    fill="none"
                    className="commit-graph-line"
                  />
                )
              })}

              {/* Draw nodes */}
              {commits.map((commit, index) => {
                const col = graphData.commitColumns.get(commit.sha) || 0
                const x = col * columnWidth + columnWidth / 2 + 4
                const y = index * rowHeight + rowHeight / 2
                const color = branchColors[col % branchColors.length]
                const isSelected = selectedCommit === commit.sha
                const isHovered = hoveredCommit === commit.sha

                return (
                  <g key={commit.sha}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected || isHovered ? nodeRadius + 2 : nodeRadius}
                      fill={isSelected ? color : "var(--background)"}
                      stroke={color}
                      strokeWidth={2}
                      className="commit-graph-node cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredCommit(commit.sha)}
                      onMouseLeave={() => setHoveredCommit(null)}
                      onClick={() => handleCommitClick(commit)}
                    />
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Commit List */}
          <div className="flex-1 min-w-0">
            {commits.map((commit, index) => {
              const col = graphData.commitColumns.get(commit.sha) || 0
              const color = branchColors[col % branchColors.length]
              const isSelected = selectedCommit === commit.sha
              const isHovered = hoveredCommit === commit.sha

              return (
                <div
                  key={commit.sha}
                  className={`flex items-center gap-3 px-4 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10"
                      : isHovered
                      ? "bg-muted/50"
                      : "hover:bg-muted/30"
                  }`}
                  style={{ height: rowHeight }}
                  onMouseEnter={() => setHoveredCommit(commit.sha)}
                  onMouseLeave={() => setHoveredCommit(null)}
                  onClick={() => handleCommitClick(commit)}
                >
                  {/* Refs (branches, tags) */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {commit.refs?.map((ref, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${color}20`,
                          color: color,
                        }}
                      >
                        {ref}
                      </span>
                    ))}
                    {commit.tags?.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                      >
                        🏷️ {tag}
                      </span>
                    ))}
                  </div>

                  {/* Commit SHA */}
                  <code className="text-xs font-mono text-muted-foreground flex-shrink-0 w-16">
                    {commit.shortSha}
                  </code>

                  {/* Commit Message */}
                  <span className="text-sm truncate flex-1">{commit.message}</span>

                  {/* Author */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                      {commit.author.avatar ? (
                        <img
                          src={commit.author.avatar}
                          alt={commit.author.name}
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <span className="text-[10px] font-medium">
                          {commit.author.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {commit.author.name}
                    </span>
                  </div>

                  {/* Date */}
                  <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right hidden md:block">
                    {commit.date}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Simplified linear commit list
interface CommitListProps {
  commits: Commit[]
  onCommitClick?: (commit: Commit) => void
}

export function CommitList({ commits, onCommitClick }: CommitListProps) {
  return (
    <div className="rounded-lg border divide-y overflow-hidden">
      {commits.map((commit) => (
        <div
          key={commit.sha}
          className="flex items-start gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
          onClick={() => onCommitClick?.(commit)}
        >
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            {commit.author.avatar ? (
              <img
                src={commit.author.avatar}
                alt={commit.author.name}
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <span className="text-sm font-medium">
                {commit.author.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{commit.message}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="font-medium">{commit.author.name}</span>
              <span>committed</span>
              <code className="font-mono">{commit.shortSha}</code>
              <span>·</span>
              <span>{commit.date}</span>
            </div>
            {(commit.refs?.length || commit.tags?.length) && (
              <div className="flex items-center gap-1 mt-2">
                {commit.refs?.map((ref, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400"
                  >
                    {ref}
                  </span>
                ))}
                {commit.tags?.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                  >
                    🏷️ {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export type { Commit, CommitGraphProps, CommitListProps }
