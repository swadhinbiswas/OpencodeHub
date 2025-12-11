import { useEffect, useRef, useState } from "react"

// Types for Monaco editor
interface MonacoEditorProps {
  value: string
  language?: string
  theme?: "vs-dark" | "vs-light"
  readOnly?: boolean
  height?: string
  onChange?: (value: string) => void
  onSave?: (value: string) => void
}

// Language detection based on file extension
const getLanguageFromPath = (path: string): string => {
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    dockerfile: "dockerfile",
    makefile: "makefile",
    toml: "toml",
    ini: "ini",
    conf: "ini",
    env: "dotenv",
  }
  return languageMap[ext] || "plaintext"
}

export function CodeEditor({
  value,
  language = "typescript",
  theme = "vs-dark",
  readOnly = false,
  height = "500px",
  onChange,
  onSave,
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [monaco, setMonaco] = useState<any>(null)

  useEffect(() => {
    // Dynamically load Monaco
    const loadMonaco = async () => {
      if (typeof window !== "undefined") {
        // @ts-ignore
        const monaco = await import("monaco-editor")
        setMonaco(monaco)
        setIsLoading(false)
      }
    }
    loadMonaco()
  }, [])

  useEffect(() => {
    if (!monaco || !containerRef.current || editorRef.current) return

    // Create editor
    editorRef.current = monaco.editor.create(containerRef.current, {
      value,
      language,
      theme,
      readOnly,
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: "JetBrains Mono, Monaco, Consolas, monospace",
      lineNumbers: "on",
      renderWhitespace: "selection",
      tabSize: 2,
      wordWrap: "on",
      folding: true,
      glyphMargin: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 4,
    })

    // Add change listener
    if (onChange) {
      editorRef.current.onDidChangeModelContent(() => {
        onChange(editorRef.current.getValue())
      })
    }

    // Add keyboard shortcuts
    editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) {
        onSave(editorRef.current.getValue())
      }
    })

    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [monaco])

  // Update value when prop changes
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.getValue()) {
      editorRef.current.setValue(value)
    }
  }, [value])

  // Update language when prop changes
  useEffect(() => {
    if (editorRef.current && monaco) {
      const model = editorRef.current.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, language)
      }
    }
  }, [language, monaco])

  // Update theme when prop changes
  useEffect(() => {
    if (monaco) {
      monaco.editor.setTheme(theme)
    }
  }, [theme, monaco])

  if (isLoading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-muted rounded-lg"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading editor...
        </div>
      </div>
    )
  }

  return <div ref={containerRef} style={{ height }} className="rounded-lg overflow-hidden border" />
}

// Diff viewer component
interface DiffViewerProps {
  original: string
  modified: string
  language?: string
  height?: string
}

export function DiffViewer({
  original,
  modified,
  language = "typescript",
  height = "500px",
}: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [monaco, setMonaco] = useState<any>(null)

  useEffect(() => {
    const loadMonaco = async () => {
      if (typeof window !== "undefined") {
        // @ts-ignore
        const monaco = await import("monaco-editor")
        setMonaco(monaco)
        setIsLoading(false)
      }
    }
    loadMonaco()
  }, [])

  useEffect(() => {
    if (!monaco || !containerRef.current || editorRef.current) return

    const originalModel = monaco.editor.createModel(original, language)
    const modifiedModel = monaco.editor.createModel(modified, language)

    editorRef.current = monaco.editor.createDiffEditor(containerRef.current, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      theme: "vs-dark",
      fontSize: 14,
      fontFamily: "JetBrains Mono, Monaco, Consolas, monospace",
    })

    editorRef.current.setModel({
      original: originalModel,
      modified: modifiedModel,
    })

    return () => {
      editorRef.current?.dispose()
      originalModel.dispose()
      modifiedModel.dispose()
      editorRef.current = null
    }
  }, [monaco, original, modified, language])

  if (isLoading) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-muted rounded-lg"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading diff viewer...
        </div>
      </div>
    )
  }

  return <div ref={containerRef} style={{ height }} className="rounded-lg overflow-hidden border" />
}

export { getLanguageFromPath }
