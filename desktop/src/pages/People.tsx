import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { api, inTauri } from '../lib/ipc'
import { clearPeopleCache, getPeopleCache, setPeopleCache } from '../state/peopleCache'
import type {
  DepartmentCluster,
  GraphEvidence,
  PeopleGraphData,
  PeopleGraphEdge,
  PeopleGraphNode,
  PersonOverride,
} from '../types/source'

const PALETTE = [
  '#e0a458',
  '#6fb3a8',
  '#8f8fe0',
  '#d97a8c',
  '#7fb069',
  '#c9a227',
  '#5fa8d3',
  '#b07aa1',
  '#9c755f',
  '#76b7b2',
  '#e07a5f',
  '#81b29a',
]

const KIND_COLOR: Record<string, string> = {
  mail: '#e0a458',
  meeting: '#6fb3a8',
  mention: '#b07aa1',
  note: '#7fb069',
}

type Draft = {
  id: string
  name: string
  email: string
  role: string
  department: string
  note: string
  manual: boolean
  isNew: boolean
}

type SimNode = PeopleGraphNode & {
  x: number
  y: number
  vx: number
  vy: number
}

type Point = { x: number; y: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function clusterCenters(
  data: PeopleGraphData,
  width: number,
  height: number,
): Map<string, Point> {
  const centers = new Map<string, Point>()
  centers.set(data.selfDepartment || 'My team', { x: width / 2, y: height / 2 })
  const others = data.departments.filter(
    (department) => department.name !== data.selfDepartment,
  )
  const radiusX = Math.min(width * 0.38, 360)
  const radiusY = Math.min(height * 0.36, 250)
  others.forEach((department, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, others.length)) * Math.PI * 2
    centers.set(department.name, {
      x: width / 2 + Math.cos(angle) * radiusX,
      y: height / 2 + Math.sin(angle) * radiusY,
    })
  })
  return centers
}

function simulate(
  nodes: SimNode[],
  edges: PeopleGraphEdge[],
  centers: Map<string, Point>,
  width: number,
  height: number,
) {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left]
      const b = nodes[right]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let distanceSq = dx * dx + dy * dy
      if (distanceSq < 1) {
        dx = 0.6
        dy = 0.6
        distanceSq = 0.72
      }
      const distance = Math.sqrt(distanceSq)
      const force = 2100 / (distanceSq + 70)
      const ux = dx / distance
      const uy = dy / distance
      a.vx -= ux * force
      a.vy -= uy * force
      b.vx += ux * force
      b.vy += uy * force
    }
  }

  for (const edge of edges) {
    const a = byId.get(edge.source)
    const b = byId.get(edge.target)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const distance = Math.hypot(dx, dy) || 1
    const target = a.department === b.department ? 58 : 136
    const strength = Math.min(0.04, 0.009 + edge.weight * 0.004)
    const force = (distance - target) * strength
    const ux = dx / distance
    const uy = dy / distance
    a.vx += ux * force
    a.vy += uy * force
    b.vx -= ux * force
    b.vy -= uy * force
  }

  for (const node of nodes) {
    const center = centers.get(node.department)
    if (center) {
      node.vx += (center.x - node.x) * 0.02
      node.vy += (center.y - node.y) * 0.02
    }
    node.vx *= 0.82
    node.vy *= 0.82
    const speed = Math.hypot(node.vx, node.vy)
    if (speed > 9) {
      node.vx = (node.vx / speed) * 9
      node.vy = (node.vy / speed) * 9
    }
    node.x = clamp(node.x + node.vx, 46, width - 46)
    node.y = clamp(node.y + node.vy, 46, height - 46)
  }
}

function kindColor(edge: PeopleGraphEdge) {
  return KIND_COLOR[edge.kinds[0]] ?? '#8a8a8a'
}

export default function People() {
  const navigate = useNavigate()
  const [data, setData] = useState<PeopleGraphData | null>(() => getPeopleCache())
  const [loading, setLoading] = useState(() => getPeopleCache() === null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kinds, setKinds] = useState({
    mail: true,
    meeting: true,
    mention: true,
    note: true,
  })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 1000, height: 680 })
  const [tick, setTick] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<SimNode[]>([])
  const dragRef = useRef<{ id: string | null; pointer: Point; origin: Point } | null>(
    null,
  )
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef(0)
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } })

  const load = useCallback((force = false) => {
    const cached = getPeopleCache()
    if (!force && cached) {
      setData(cached)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api
      .peopleGraph()
      .then((graph) => {
        setPeopleCache(graph)
        setData(graph)
        setSelected(graph.selfId || graph.nodes[0]?.id || null)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (data && !selected) {
      setSelected(data.selfId || data.nodes[0]?.id || null)
    }
  }, [data, selected])

  useEffect(() => {
    const onInvalidate = () => {
      clearPeopleCache()
      void load(true)
    }
    window.addEventListener('frontdesk-people-invalidate', onInvalidate)
    return () => window.removeEventListener('frontdesk-people-invalidate', onInvalidate)
  }, [load])

  useEffect(() => {
    viewRef.current = { zoom, pan }
  }, [zoom, pan])

  // Wheel zoom must be a native listener so preventDefault works; React's
  // synthetic wheel events are passive at the root.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onNativeWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const { zoom: currentZoom, pan: currentPan } = viewRef.current
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const worldX = (mx - currentPan.x) / currentZoom
      const worldY = (my - currentPan.y) / currentZoom
      const next = clamp(currentZoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 3)
      viewRef.current = {
        zoom: next,
        pan: { x: mx - worldX * next, y: my - worldY * next },
      }
      setZoom(next)
      setPan(viewRef.current.pan)
    }
    svg.addEventListener('wheel', onNativeWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onNativeWheel)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({
        width: Math.max(320, Math.round(entry.contentRect.width)),
        height: Math.max(380, Math.round(entry.contentRect.height)),
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const departmentColor = useMemo(() => {
    const map = new Map<string, string>()
    if (!data) return map
    const departments = [...data.departments].sort((left, right) => {
      if (left.name === data.selfDepartment) return -1
      if (right.name === data.selfDepartment) return 1
      return right.count - left.count
    })
    departments.forEach((department, index) => {
      map.set(
        department.name,
        department.name === data.selfDepartment
          ? '#e0a458'
          : PALETTE[(index + 1) % PALETTE.length],
      )
    })
    return map
  }, [data])

  const centers = useMemo(
    () => (data ? clusterCenters(data, size.width, size.height) : new Map()),
    [data, size.width, size.height],
  )

  // Seed node positions, then settle with a short force simulation.
  useEffect(() => {
    if (!data) return
    const existing = new Map(nodesRef.current.map((node) => [node.id, node]))
    nodesRef.current = data.nodes.map((node, index) => {
      const previous = existing.get(node.id)
      if (previous) return { ...node, x: previous.x, y: previous.y, vx: 0, vy: 0 }
      const center = centers.get(node.department) ?? {
        x: size.width / 2,
        y: size.height / 2,
      }
      const angle = (index / Math.max(1, data.nodes.length)) * Math.PI * 2
      const radius = 24 + ((index * 37) % 64)
      return {
        ...node,
        x: clamp(center.x + Math.cos(angle) * radius, 46, size.width - 46),
        y: clamp(center.y + Math.sin(angle) * radius, 46, size.height - 46),
        vx: 0,
        vy: 0,
      }
    })

    // Paint the seeded nodes immediately. Background tabs pause
    // requestAnimationFrame, and the graph should still be visible then.
    setTick((value) => value + 1)

    cancelAnimationFrame(frameRef.current)
    let ticks = 0
    const step = () => {
      simulate(nodesRef.current, data.edges, centers, size.width, size.height)
      ticks += 1
      setTick((value) => value + 1)
      if (ticks < 420) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [data, centers, size.width, size.height])

  const nodes = nodesRef.current
  const selectedNode = data?.nodes.find((node) => node.id === selected) ?? null

  const visibleEdges = useMemo(() => {
    if (!data) return []
    return data.edges.filter((edge) =>
      edge.kinds.some((kind) => kinds[kind as keyof typeof kinds]),
    )
  }, [data, kinds])

  const connections = useMemo(() => {
    if (!data || !selected) return []
    const byId = new Map(data.nodes.map((node) => [node.id, node]))
    return data.edges
      .filter((edge) => edge.source === selected || edge.target === selected)
      .map((edge) => {
        const otherId = edge.source === selected ? edge.target : edge.source
        return { edge, other: byId.get(otherId) }
      })
      .filter((entry): entry is { edge: PeopleGraphEdge; other: PeopleGraphNode } =>
        Boolean(entry.other),
      )
      .sort((left, right) => right.edge.weight - left.edge.weight)
      .slice(0, 7)
  }, [data, selected])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return null
    const set = new Set<string>()
    for (const node of data?.nodes ?? []) {
      if (
        node.name.toLowerCase().includes(needle) ||
        node.department.toLowerCase().includes(needle) ||
        (node.role ?? '').toLowerCase().includes(needle)
      ) {
        set.add(node.id)
      }
    }
    return set
  }, [data, query])

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    dragRef.current = null
    panRef.current = {
      x: event.clientX - pan.x,
      y: event.clientY - pan.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onNodePointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    node: SimNode,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    dragRef.current = {
      id: node.id,
      pointer: { x: event.clientX, y: event.clientY },
      origin: { x: node.x, y: node.y },
    }
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.id) {
      const { id, pointer, origin } = dragRef.current
      const node = nodesRef.current.find((entry) => entry.id === id)
      if (node) {
        node.x = origin.x + (event.clientX - pointer.x) / zoom
        node.y = origin.y + (event.clientY - pointer.y) / zoom
        node.vx = 0
        node.vy = 0
        setTick((value) => value + 1)
      }
      return
    }
    if (panRef.current) {
      setPan({
        x: event.clientX - panRef.current.x,
        y: event.clientY - panRef.current.y,
      })
    }
  }

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null
    panRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const focusDepartment = (department: DepartmentCluster) => {
    const center = centers.get(department.name)
    if (!center) return
    const next = 1.25
    setZoom(next)
    setPan({
      x: size.width / 2 - center.x * next,
      y: size.height / 2 - center.y * next,
    })
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const ask = (name: string) => {
    navigate('/', {
      state: { focusAsk: true, question: `Catch me up on ${name}`, at: Date.now() },
    })
  }

  const decoratedEdges = useMemo(() => {
    void tick
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return visibleEdges
      .map((edge) => {
        const source = byId.get(edge.source)
        const target = byId.get(edge.target)
        if (!source || !target) return null
        const active =
          !selected || edge.source === selected || edge.target === selected
        return { edge, source, target, active }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  }, [nodes, visibleEdges, selected, tick])

  const nodeRadius = (node: PeopleGraphNode) =>
    clamp(5 + Math.sqrt(node.weight) * 2.6 + (node.isSelf ? 4 : 0), 6, 26)

  const startEdit = (node: PeopleGraphNode) => {
    setDraft({
      id: node.id,
      name: node.name,
      email: node.email ?? '',
      role: node.role ?? '',
      department: node.department,
      note: node.note ?? '',
      manual: node.manual,
      isNew: false,
    })
  }

  const startAdd = () => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `manual:${crypto.randomUUID()}`
        : `manual:${Date.now()}`
    setDraft({
      id,
      name: '',
      email: '',
      role: '',
      department: '',
      note: '',
      manual: true,
      isNew: true,
    })
  }

  const patchDraft = (field: keyof Draft, value: string) =>
    setDraft((current) => (current ? { ...current, [field]: value } : current))

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    if (!draft.name.trim()) {
      setNotice('Give the person a name first.')
      return
    }
    const person: PersonOverride = {
      id: draft.id,
      name: draft.name.trim(),
      email: draft.email.trim() || null,
      role: draft.role.trim() || null,
      department: draft.department.trim() || null,
      note: draft.note.trim() || null,
      manual: draft.manual || draft.isNew,
    }
    setSaving(true)
    try {
      await api.upsertPerson(person)
      setDraft(null)
      setNotice(draft.isNew ? 'Person added.' : 'Saved locally.')
      load(true)
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const resetPerson = async (node: PeopleGraphNode) => {
    try {
      await api.removePerson(node.id)
      setNotice('Local edits removed.')
      load(true)
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const openEvidence = async (evidence: GraphEvidence) => {
    if (!evidence.sourceId) return
    try {
      await api.openOriginal(evidence.sourceId)
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const exportGraph = async () => {
    if (!data) return
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const path = await save({
        defaultPath: 'frontdesk-people.json',
        filters: [{ name: 'FrontDesk people graph', extensions: ['json'] }],
      })
      if (typeof path !== 'string') return
      await api.exportPeopleGraph(path, data)
      setNotice(`Exported the graph to ${path}`)
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const importGraph = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        multiple: false,
        filters: [{ name: 'FrontDesk people graph', extensions: ['json'] }],
      })
      if (typeof path !== 'string') return
      const snapshot = await api.importPeopleGraph(path)
      setPeopleCache(snapshot.graph)
      setData(snapshot.graph)
      setSelected(snapshot.graph.selfId || snapshot.graph.nodes[0]?.id || null)
      setNotice(
        `Imported the graph saved ${new Date(snapshot.exportedAt).toLocaleString()}.`,
      )
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <div className="peoplePage">
      <header className="peopleHeader">
        <div>
          <p className="eyebrow">Relationships</p>
          <h1 className="pageTitle">People graph</h1>
          <p className="peopleHeader__lede">
            Clusters come from mail signatures and your Microsoft profile. Lines are
            mail, meetings, mentions and the notes you granted. Every role can be
            traced to its source, and local edits stay on this device.
          </p>
        </div>
        <div className="peopleHeader__actions">
          <button type="button" className="btn btn--ghost" onClick={startAdd}>
            Add person
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => load(true)} disabled={loading}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
            </svg>
            {loading ? 'Reading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={resetView}>
            Reset view
          </button>
          {inTauri() ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={exportGraph}>
                Export
              </button>
              <button type="button" className="btn btn--ghost" onClick={importGraph}>
                Import
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? (
        <section className="panel peopleEmpty">
          <h2>Could not build the graph</h2>
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={() => load(true)}>
            Try again
          </button>
        </section>
      ) : loading && !data ? (
        <section className="panel peopleEmpty">
          <span className="peopleSpinner" aria-hidden="true" />
          <h2>Reading mail and calendar metadata…</h2>
          <p>Names, departments and interaction weights stay in memory.</p>
        </section>
      ) : data &&
        (data.source === 'empty' ||
          data.nodes.length === 0 ||
          (data.nodes.length === 1 && data.nodes[0].isSelf)) ? (
        <section className="panel peopleEmpty">
          <h2>Connect Microsoft to see your people graph</h2>
          <p>
            FrontDesk reads senders, recipients, attendees and signature lines.
            Connect Microsoft in Settings, then refresh. Directory roles appear
            automatically if `People.Read` is present on the app registration.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate('/settings')}
          >
            Open Settings
          </button>
        </section>
      ) : data ? (
        <>
          <div className="peopleStats">
            <span>
              <strong>{data.nodes.length}</strong> people
            </span>
            <span>
              <strong>{data.edges.length}</strong> connections
            </span>
            <span>
              <strong>{data.departments.length}</strong> departments
            </span>
            <span>
              Scanned <strong>{data.scannedMessages}</strong> messages ·{' '}
              <strong>{data.scannedEvents}</strong> events ·{' '}
              <strong>{data.scannedNotes}</strong> notes
            </span>
          </div>

          {notice ? (
            <div className="peopleNotice" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          ) : null}

          <div className="peopleToolbar">
            <label className="peopleSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM16 16l4 4" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a person, role or department"
                aria-label="Find a person"
              />
            </label>
            <div className="peopleFilters" role="group" aria-label="Connection types">
              {(
                [
                  ['mail', 'Mail', '#e0a458'],
                  ['meeting', 'Meetings', '#6fb3a8'],
                  ['mention', 'Mentions', '#b07aa1'],
                  ['note', 'Notes', '#7fb069'],
                ] as const
              ).map(([key, label, color]) => (
                <button
                  key={key}
                  type="button"
                  className={`peopleFilter${kinds[key] ? ' is-on' : ''}`}
                  onClick={() => setKinds((current) => ({ ...current, [key]: !current[key] }))}
                  aria-pressed={kinds[key]}
                >
                  <span className="peopleFilter__dot" style={{ background: color }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="peopleBody">
            <div className="peopleCanvasWrap" ref={containerRef}>
              <svg
                ref={svgRef}
                className="peopleCanvas"
                viewBox={`0 0 ${size.width} ${size.height}`}
                role="img"
                aria-label="People relationship graph"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
              >
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                  {data.departments.map((department) => {
                    const center = centers.get(department.name)
                    if (!center) return null
                    const color = departmentColor.get(department.name) ?? '#8a8a8a'
                    const radius = 54 + Math.sqrt(department.count) * 22
                    const dim =
                      matches && !data.nodes.some(
                        (node) =>
                          matches.has(node.id) && node.department === department.name,
                      )
                    return (
                      <g key={department.name} opacity={dim ? 0.25 : 0.55}>
                        <circle
                          cx={center.x}
                          cy={center.y}
                          r={radius}
                          fill={color}
                          opacity={0.05}
                        />
                        <circle
                          cx={center.x}
                          cy={center.y}
                          r={radius}
                          fill="none"
                          stroke={color}
                          strokeOpacity={0.28}
                          strokeDasharray="3 8"
                        />
                        <text
                          x={center.x}
                          y={center.y - radius - 8}
                          textAnchor="middle"
                          className="peopleClusterLabel"
                          style={{ fill: color }}
                        >
                          {department.name}
                        </text>
                      </g>
                    )
                  })}

                  {decoratedEdges.map(({ edge, source, target, active }) => {
                    const color = kindColor(edge)
                    const width = 0.7 + Math.min(4, Math.log2(1 + edge.weight) * 0.9)
                    const dim =
                      (!active && selected) ||
                      (matches && !(matches.has(source.id) && matches.has(target.id)))
                    return (
                      <line
                        key={edge.id}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={active && selected ? '#f0b866' : color}
                        strokeWidth={active && selected ? width + 0.7 : width}
                        strokeOpacity={dim ? 0.06 : active ? 0.5 : 0.18}
                        strokeLinecap="round"
                      />
                    )
                  })}

                  {nodes.map((node) => {
                    const color = departmentColor.get(node.department) ?? '#8a8a8a'
                    const radius = nodeRadius(node)
                    const isSelected = node.id === selected
                    const isHovered = node.id === hovered
                    const dim = matches ? !matches.has(node.id) : false
                    const showLabel =
                      node.isSelf ||
                      isSelected ||
                      isHovered ||
                      zoom >= 1.3 ||
                      node.weight >= 7
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x} ${node.y})`}
                        className={`peopleNode${isSelected ? ' is-selected' : ''}`}
                        opacity={dim ? 0.2 : 1}
                        role="button"
                        tabIndex={0}
                        aria-label={`${node.name}, ${node.role ?? node.department}`}
                        onPointerDown={(event) => onNodePointerDown(event, node)}
                        onPointerEnter={() => setHovered(node.id)}
                        onPointerLeave={() =>
                          setHovered((current) => (current === node.id ? null : current))
                        }
                        onClick={() => setSelected(node.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelected(node.id)
                          }
                        }}
                      >
                        {isSelected || isHovered ? (
                          <circle r={radius + 7} fill={color} opacity={0.16} />
                        ) : null}
                        <circle
                          r={radius}
                          fill={color}
                          stroke={node.isSelf ? '#fff3dc' : 'var(--bg)'}
                          strokeWidth={node.isSelf ? 2.2 : 1.4}
                        />
                        {node.isSelf ? (
                          <circle r={radius - 4.5} fill="none" stroke="#1b1712" strokeOpacity={0.45} />
                        ) : null}
                        {showLabel ? (
                          <text
                            y={radius + 13}
                            textAnchor="middle"
                            className="peopleNodeLabel"
                          >
                            {node.isSelf ? 'You' : node.name}
                          </text>
                        ) : null}
                      </g>
                    )
                  })}
                </g>
              </svg>

              <div className="peopleZoom">
                <button
                  type="button"
                  onClick={() => setZoom((value) => clamp(value * 1.15, 0.45, 3))}
                  aria-label="Zoom in"
                >
                  +
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((value) => clamp(value / 1.15, 0.45, 3))}
                  aria-label="Zoom out"
                >
                  −
                </button>
              </div>
            </div>

            <aside className="peopleSide">
              <div className="peopleLegend">
                <h2>Departments</h2>
                {data.departments.map((department) => (
                  <button
                    key={department.name}
                    type="button"
                    className="peopleLegend__row"
                    onClick={() => focusDepartment(department)}
                  >
                    <span
                      className="peopleLegend__dot"
                      style={{ background: departmentColor.get(department.name) }}
                    />
                    <span>{department.name}</span>
                    <em>{department.count}</em>
                  </button>
                ))}
              </div>

              {selectedNode ? (
                <div className="peopleCard">
                  <div className="peopleCard__head">
                    <span
                      className="peopleCard__avatar"
                      style={{ background: departmentColor.get(selectedNode.department) }}
                    >
                      {initials(selectedNode.name)}
                    </span>
                    <div>
                      <strong>{selectedNode.name}</strong>
                      <em>{selectedNode.role ?? 'Role not in directory'}</em>
                    </div>
                    <button
                      type="button"
                      className="peopleCard__edit"
                      onClick={() => startEdit(selectedNode)}
                    >
                      Edit
                    </button>
                  </div>
                  <span className="peopleCard__dept">
                    {selectedNode.department}
                    {selectedNode.isSelf ? ' · you' : ''}
                  </span>
                  <div className="peopleCard__counts">
                    <span>
                      <strong>{selectedNode.mailCount}</strong> mail
                    </span>
                    <span>
                      <strong>{selectedNode.meetingCount}</strong> meetings
                    </span>
                    <span>
                      <strong>{selectedNode.mentionCount}</strong> mentions
                    </span>
                    <span>
                      <strong>{selectedNode.noteCount}</strong> notes
                    </span>
                  </div>
                  {selectedNode.email ? (
                    <p className="peopleCard__email">{selectedNode.email}</p>
                  ) : null}
                  {selectedNode.note ? (
                    <div className="peopleCard__note">
                      <strong>Your note</strong>
                      <p>{selectedNode.note}</p>
                    </div>
                  ) : null}

                  <h3>Where this comes from</h3>
                  {selectedNode.evidence.length ? (
                    <ul className="peopleEvidence">
                      {selectedNode.evidence.map((evidence, index) => (
                        <li key={`${evidence.kind}-${evidence.sourceId ?? evidence.title}-${index}`}>
                          <span className={`peopleEvidence__badge is-${evidence.kind}`}>
                            {evidence.kind}
                          </span>
                          <div className="peopleEvidence__body">
                            <strong>{evidence.title}</strong>
                            {evidence.detail ? <em>{evidence.detail}</em> : null}
                            {evidence.excerpt ? <p>{evidence.excerpt}</p> : null}
                          </div>
                          {evidence.sourceId ? (
                            <button
                              type="button"
                              onClick={() => void openEvidence(evidence)}
                            >
                              Open
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="panel__note">No source evidence for this person yet.</p>
                  )}

                  <h3>Strongest links</h3>
                  {connections.length ? (
                    <ul className="peopleConnections">
                      {connections.map(({ edge, other }) => (
                        <li key={edge.id}>
                          <button type="button" onClick={() => setSelected(other.id)}>
                            <span
                              className="peopleConnections__dot"
                              style={{ background: departmentColor.get(other.department) }}
                            />
                            <span>
                              <strong>{other.name}</strong>
                              <em>{other.department}</em>
                            </span>
                            <b>{edge.weight}</b>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="panel__note">No links in the current filters.</p>
                  )}

                  <button
                    type="button"
                    className="btn btn--primary peopleCard__ask"
                    onClick={() => ask(selectedNode.name)}
                  >
                    Ask FrontDesk about {selectedNode.name.split(' ')[0]}
                  </button>
                  {selectedNode.edited ? (
                    <button
                      type="button"
                      className="peopleCard__reset"
                      onClick={() => void resetPerson(selectedNode)}
                    >
                      Reset local edits
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="peopleCard peopleCard--empty">
                  <p>Select a person to see their department, role and strongest links.</p>
                </div>
              )}
            </aside>
          </div>
        </>
      ) : null}

      {draft ? (
        <div className="peopleEditor" role="dialog" aria-modal="true" aria-labelledby="peopleEditorTitle">
          <form className="peopleEditor__card" onSubmit={saveDraft}>
            <h2 id="peopleEditorTitle">{draft.isNew ? 'Add a person' : 'Edit person'}</h2>
            <p>
              Saved as a local override in the app data folder. Microsoft 365 and your
              source notes are unchanged.
            </p>
            <label>
              Name
              <input
                autoFocus
                value={draft.name}
                onChange={(event) => patchDraft('name', event.target.value)}
                placeholder="e.g. Anika Okafor"
              />
            </label>
            <label>
              Email
              <input
                value={draft.email}
                onChange={(event) => patchDraft('email', event.target.value)}
                placeholder="name@company.com"
              />
            </label>
            <label>
              Role
              <input
                value={draft.role}
                onChange={(event) => patchDraft('role', event.target.value)}
                placeholder="Senior Brand Manager"
              />
            </label>
            <label>
              Department
              <input
                value={draft.department}
                onChange={(event) => patchDraft('department', event.target.value)}
                placeholder="Commercial & Marketing"
              />
            </label>
            <label>
              Your note
              <textarea
                rows={4}
                value={draft.note}
                onChange={(event) => patchDraft('note', event.target.value)}
                placeholder="Context only you need: how you work together, what to remember."
              />
            </label>
            <div className="peopleEditor__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
