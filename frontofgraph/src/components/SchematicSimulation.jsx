import React, { useState, useRef, useEffect, useMemo } from "react";
import {
    Play,
    Square,
    Terminal,
    Compass,
    Activity,
    Layers,
    ZoomIn,
    ZoomOut,
    Sparkles,
    Save,
    Move,
    X,
    RotateCcw
} from "lucide-react";

export default function SchematicSimulation({
    nodes = [],
    setNodes,
    edges = [],
    setEdges,
    vehicles = [],
    isSimulating = false,
    toggleSimulation,
    robotRoutes = [],
    handleRouteChange,
    vehicleCount = 3,
    plotKey = "",
    activeLogs = [],
    setActiveLogs,
    onSwitchTab,
    saveRobotRoutesToDb
}) {
    const svgRef = useRef(null);

    // Pan & Zoom states
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Select & Move (Dragging) states
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [saveToast, setSaveToast] = useState("");

    // Custom turn angles per intersection node (defaults to 90°)
    const [nodeAngles, setNodeAngles] = useState(() => {
        const initial = {};
        nodes.forEach(n => {
            if (n.type === "intersection") {
                initial[n.id] = n.turnAngle || 90;
            }
        });
        return initial;
    });

    // Edit Modals
    const [editingEdge, setEditingEdge] = useState(null);
    const [distanceInput, setDistanceInput] = useState("");
    const [editingNodeAngle, setEditingNodeAngle] = useState(null);
    const [angleInput, setAngleInput] = useState("");

    // Terminal states
    const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
    const [selectedRobotFilter, setSelectedRobotFilter] = useState("all");
    const terminalEndRef = useRef(null);

    // Auto-scroll terminal to bottom
    useEffect(() => {
        if (terminalEndRef.current && !isTerminalCollapsed) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [activeLogs, isTerminalCollapsed]);

    // Keep nodeAngles in sync when nodes change
    useEffect(() => {
        setNodeAngles(prev => {
            const next = { ...prev };
            nodes.forEach(n => {
                if (n.type === "intersection" && next[n.id] === undefined) {
                    next[n.id] = n.turnAngle || 90;
                }
            });
            return next;
        });
    }, [nodes]);

    // Coordinate conversion helper: client coordinates -> SVG canvas coordinates
    const getSVGCoords = (e) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - pan.x) / zoom,
            y: (e.clientY - rect.top - pan.y) / zoom
        };
    };

    // Canvas Mouse Down: Starts panning if clicking background
    const handleCanvasMouseDown = (e) => {
        if (e.target.tagName === "svg" || e.target.id === "schematic-grid-bg") {
            setSelectedNodeId(null);
            setIsPanning(true);
            setPanStart({
                x: e.clientX - pan.x,
                y: e.clientY - pan.y
            });
        }
    };

    // Node Mouse Down: Select & start dragging
    const handleNodeMouseDown = (e, node) => {
        e.stopPropagation();
        setSelectedNodeId(node.id);
        setDraggingNodeId(node.id);
        const coords = getSVGCoords(e);
        setDragOffset({
            x: coords.x - node.x,
            y: coords.y - node.y
        });
    };

    // Canvas Mouse Move: Handles panning or node dragging
    const handleCanvasMouseMove = (e) => {
        if (isPanning) {
            setPan({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
            return;
        }

        if (draggingNodeId && setNodes) {
            const coords = getSVGCoords(e);
            const newX = Math.round((coords.x - dragOffset.x) / 10) * 10;
            const newY = Math.round((coords.y - dragOffset.y) / 10) * 10;

            setNodes(prev => prev.map(n => {
                if (n.id === draggingNodeId) {
                    return { ...n, x: newX, y: newY };
                }
                return n;
            }));
        }
    };

    // Canvas Mouse Up: Release drag or pan
    const handleCanvasMouseUp = () => {
        setDraggingNodeId(null);
        setIsPanning(false);
    };

    // Wheel zoom centered on cursor
    useEffect(() => {
        const svgEl = svgRef.current;
        if (!svgEl) return;

        const handleWheel = (e) => {
            e.preventDefault();
            const factor = 1.08;
            let newZoom = zoom;

            if (e.deltaY < 0) {
                newZoom = Math.min(zoom * factor, 3.5);
            } else {
                newZoom = Math.max(zoom / factor, 0.4);
            }

            if (newZoom !== zoom) {
                const rect = svgEl.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const dx = mouseX - pan.x;
                const dy = mouseY - pan.y;

                setPan({
                    x: mouseX - dx * (newZoom / zoom),
                    y: mouseY - dy * (newZoom / zoom)
                });
                setZoom(newZoom);
            }
        };

        svgEl.addEventListener("wheel", handleWheel, { passive: false });
        return () => svgEl.removeEventListener("wheel", handleWheel);
    }, [zoom, pan]);

    // De-congest Layout helper: spreads nodes out if congested
    const deCongestLayout = () => {
        if (!setNodes || nodes.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const scaleFactor = 1.35; // 35% more spread

        setNodes(prev => prev.map(n => ({
            ...n,
            x: Math.round((centerX + (n.x - centerX) * scaleFactor) / 10) * 10,
            y: Math.round((centerY + (n.y - centerY) * scaleFactor) / 10) * 10
        })));

        setSaveToast("Spread out layout!");
        setTimeout(() => setSaveToast(""), 2500);
    };

    // Save distance edit
    const handleSaveDistance = () => {
        if (!editingEdge) return;
        const val = parseFloat(distanceInput);
        if (!isNaN(val) && val > 0 && setEdges) {
            setEdges(prev => prev.map(e => e.id === editingEdge.id ? { ...e, distance: val } : e));
        }
        setEditingEdge(null);
        setDistanceInput("");
    };

    // Save angle edit
    const handleSaveAngle = () => {
        if (!editingNodeAngle) return;
        const val = parseFloat(angleInput);
        if (!isNaN(val) && val >= 0 && val <= 360) {
            setNodeAngles(prev => ({ ...prev, [editingNodeAngle.id]: val }));
            if (setNodes) {
                setNodes(prev => prev.map(n => n.id === editingNodeAngle.id ? { ...n, turnAngle: val } : n));
            }
        }
        setEditingNodeAngle(null);
        setAngleInput("");
    };

    // Save graph layout to database
    const handleSaveLayout = async () => {
        if (saveRobotRoutesToDb) {
            await saveRobotRoutesToDb();
            setSaveToast("Layout Saved!");
            setTimeout(() => setSaveToast(""), 3000);
        }
    };

    // Node ring color in schematic theme
    const getNodeRingColor = (type) => {
        if (type === "loading" || type === "source") return "#10B981"; // Green
        if (type === "intersection") return "#F59E0B";                 // Yellow / Orange
        if (type === "unloading") return "#EF4444";                    // Red
        return "#6B7280";
    };

    // Default distinct colors for robot dots
    const getRobotColor = (idx) => {
        const colors = ["#2563EB", "#7C3AED", "#EA580C", "#0D9488", "#E11D48", "#D97706"];
        return colors[idx % colors.length];
    };

    // Filtered logs for terminal
    const displayedLogs = useMemo(() => {
        if (selectedRobotFilter === "all") return activeLogs;
        return activeLogs.filter(log => {
            const rIdx = selectedRobotFilter;
            return log.text.includes(`Robot ${rIdx + 1}`) || log.id.includes(`-r-${rIdx}`) || log.type === "system";
        });
    }, [activeLogs, selectedRobotFilter]);

    // Idle robot dots stationed at starting docks when not simulating
    const idleVehicles = useMemo(() => {
        if (isSimulating) return [];
        return robotRoutes.map((route, idx) => {
            const startNode = nodes.find(n => n.id === route.startNodeId) || nodes.find(n => n.type === "loading");
            if (!startNode) return null;
            return {
                id: `idle-v-${idx}`,
                robotId: idx,
                x: startNode.x,
                y: startNode.y,
                color: getRobotColor(idx),
                heading: 0,
                turningAngle: 0,
                status: "IDLE AT DOCK",
                startNodeLabel: startNode.label || startNode.id
            };
        }).filter(Boolean);
    }, [isSimulating, robotRoutes, nodes]);

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: "#FFFFFF",
            color: "#111827",
            fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
            overflow: "hidden",
            position: "relative"
        }}>
            {/* ================================================================= */}
            {/* MINIMAL TOP CONTROL BAR                                           */}
            {/* ================================================================= */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 18px",
                background: "#FFFFFF",
                borderBottom: "1px solid #E5E7EB",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                zIndex: 20,
                flexWrap: "wrap",
                gap: "10px"
            }}>
                {/* Left: Tab Switcher & Status */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        background: "#F3F4F6",
                        border: "1px solid #E5E7EB",
                        borderRadius: "8px",
                        padding: "2px",
                        gap: "2px"
                    }}>
                        <button
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "default",
                                border: "none",
                                background: "#FFFFFF",
                                color: "#111827",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
                            }}
                        >
                            <Sparkles size={13} style={{ color: "#10B981" }} />
                            Schematic Grid
                        </button>
                        {onSwitchTab && (
                            <button
                                onClick={() => onSwitchTab("dark")}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    border: "none",
                                    background: "transparent",
                                    color: "#6B7280"
                                }}
                            >
                                <Layers size={13} />
                                Dark Canvas
                            </button>
                        )}
                    </div>

                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        color: isSimulating ? "#059669" : "#6B7280",
                        background: isSimulating ? "#ECFDF5" : "#F9FAFB",
                        padding: "4px 10px",
                        borderRadius: "14px",
                        border: isSimulating ? "1px solid #A7F3D0" : "1px solid #E5E7EB",
                        fontWeight: 600
                    }}>
                        <span style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: isSimulating ? "#10B981" : "#9CA3AF",
                            display: "inline-block",
                            boxShadow: isSimulating ? "0 0 6px #10B981" : "none"
                        }} />
                        {isSimulating ? "Simulating AGV Traversal" : "Select & Drag Nodes to Adjust Layout"}
                    </div>
                </div>

                {/* Center: Minimal Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                        onClick={toggleSimulation}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 16px",
                            borderRadius: "7px",
                            fontWeight: 700,
                            fontSize: "12px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            border: isSimulating ? "1px solid #FCA5A5" : "1px solid #6EE7B7",
                            background: isSimulating ? "#FEF2F2" : "#ECFDF5",
                            color: isSimulating ? "#DC2626" : "#059669"
                        }}
                    >
                        {isSimulating ? <Square size={13} fill="#DC2626" /> : <Play size={13} fill="#059669" />}
                        {isSimulating ? "Stop Simulation" : "Start Simulation"}
                    </button>

                    <button
                        onClick={deCongestLayout}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 12px",
                            borderRadius: "7px",
                            fontWeight: 600,
                            fontSize: "12px",
                            cursor: "pointer",
                            background: "#F9FAFB",
                            border: "1px solid #E5E7EB",
                            color: "#374151"
                        }}
                        title="Spread out nodes to reduce congestion"
                    >
                        <Move size={12} />
                        Space Out
                    </button>

                    {saveRobotRoutesToDb && (
                        <button
                            onClick={handleSaveLayout}
                            disabled={isSimulating}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "6px 12px",
                                borderRadius: "7px",
                                fontWeight: 600,
                                fontSize: "12px",
                                cursor: isSimulating ? "not-allowed" : "pointer",
                                background: "#FFFFFF",
                                border: "1px solid #D1D5DB",
                                color: "#10B981"
                            }}
                        >
                            <Save size={12} />
                            Save Layout
                        </button>
                    )}

                    {saveToast && (
                        <span style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                            ✓ {saveToast}
                        </span>
                    )}
                </div>

                {/* Right: Zoom Controls & White Terminal Toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: "7px" }}>
                        <button
                            onClick={() => setZoom(z => Math.min(3.0, z + 0.15))}
                            style={{ background: "transparent", border: "none", padding: "5px 7px", cursor: "pointer", color: "#4B5563" }}
                            title="Zoom In"
                        >
                            <ZoomIn size={13} />
                        </button>
                        <button
                            onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
                            style={{ background: "transparent", border: "none", padding: "5px 7px", cursor: "pointer", color: "#4B5563" }}
                            title="Zoom Out"
                        >
                            <ZoomOut size={13} />
                        </button>
                        <button
                            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                            style={{ background: "transparent", border: "none", padding: "5px 7px", cursor: "pointer", color: "#4B5563", fontSize: "11px", fontWeight: 600 }}
                            title="Reset View"
                        >
                            Reset
                        </button>
                    </div>

                    <button
                        onClick={() => setIsTerminalCollapsed(!isTerminalCollapsed)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 12px",
                            borderRadius: "7px",
                            background: !isTerminalCollapsed ? "#F3F4F6" : "#FFFFFF",
                            border: "1px solid #E5E7EB",
                            color: "#374151",
                            fontWeight: 600,
                            fontSize: "12px",
                            cursor: "pointer"
                        }}
                    >
                        <Terminal size={13} />
                        {isTerminalCollapsed ? "Terminal" : "Hide Terminal"}
                    </button>
                </div>
            </div>

            {/* ================================================================= */}
            {/* MAIN WORKSPACE: MINIMAL SCHEMATIC CANVAS + WHITE TERMINAL SET     */}
            {/* ================================================================= */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
                {/* SVG Schematic Canvas Container */}
                <div
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                    style={{
                        flex: 1,
                        height: "100%",
                        background: "#FFFFFF",
                        overflow: "hidden",
                        position: "relative",
                        cursor: isPanning ? "grabbing" : (draggingNodeId ? "grabbing" : "default")
                    }}
                >
                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        id="schematic-svg"
                        style={{ display: "block" }}
                    >
                        <defs>
                            {/* Visible graph paper grid matching schematic design */}
                            <pattern
                                id="schematic-grid"
                                width="30"
                                height="30"
                                patternUnits="userSpaceOnUse"
                                patternTransform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                            >
                                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#E2E8F0" strokeWidth="1.1" />
                            </pattern>

                            {/* Drop shadow filter */}
                            <filter id="badge-shadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.08" />
                            </filter>
                            <filter id="node-shadow" x="-25%" y="-25%" width="150%" height="150%">
                                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.10" />
                            </filter>
                        </defs>

                        {/* Grid Background */}
                        <rect id="schematic-grid-bg" width="100%" height="100%" fill="url(#schematic-grid)" />

                        {/* Pan & Zoom Transform Group */}
                        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                            {/* ================================================================= */}
                            {/* 1. PATH EDGES (Clean dotted lines with clickable distance badge) */}
                            {/* ================================================================= */}
                            {edges.map(edge => {
                                const fromNode = nodes.find(n => n.id === edge.from);
                                const toNode = nodes.find(n => n.id === edge.to);
                                if (!fromNode || !toNode) return null;

                                const midX = (fromNode.x + toNode.x) / 2;
                                const midY = (fromNode.y + toNode.y) / 2;
                                const dist = edge.distance !== undefined ? edge.distance : 1000;

                                return (
                                    <g key={edge.id}>
                                        {/* Clean path line connecting nodes */}
                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke="#1F2937"
                                            strokeWidth="2.5"
                                            strokeDasharray="5 5"
                                            strokeLinecap="round"
                                        />

                                        {/* Minimal Clickable Distance Badge */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingEdge(edge);
                                                setDistanceInput(dist.toString());
                                            }}
                                            style={{ cursor: "pointer" }}
                                        >
                                            <title>Click to edit distance: {dist}cm</title>
                                            <rect
                                                x={midX - 28}
                                                y={midY - 10}
                                                width="56"
                                                height="20"
                                                rx="5"
                                                fill="#FFFFFF"
                                                stroke="#E5E7EB"
                                                strokeWidth="1"
                                                filter="url(#badge-shadow)"
                                            />
                                            <text
                                                x={midX}
                                                y={midY + 4}
                                                textAnchor="middle"
                                                fontSize="10px"
                                                fontWeight="700"
                                                fill="#374151"
                                                fontFamily="'Outfit', sans-serif"
                                            >
                                                {dist}cm
                                            </text>
                                        </g>
                                    </g>
                                );
                            })}

                            {/* ================================================================= */}
                            {/* 2. INTERSECTION ANGLE BADGES (Minimal, clean turn angle pill)    */}
                            {/* ================================================================= */}
                            {nodes.filter(n => n.type === "intersection").map(iNode => {
                                const angle = nodeAngles[iNode.id] || 90;
                                // Place angle badge neatly adjacent to the intersection
                                const bx = iNode.x + 32;
                                const by = iNode.y - 24;

                                return (
                                    <g
                                        key={`angle-badge-${iNode.id}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingNodeAngle(iNode);
                                            setAngleInput(angle.toString());
                                        }}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <title>Click to change turn angle for {iNode.label || iNode.id} (Current: {angle}°)</title>
                                        {/* Subtle corner arc indicator */}
                                        <path
                                            d={`M ${iNode.x + 20},${iNode.y - 6} A 20 20 0 0 0 ${iNode.x + 6},${iNode.y - 20}`}
                                            fill="none"
                                            stroke="#F59E0B"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                        />
                                        {/* Angle Pill */}
                                        <rect
                                            x={bx - 14}
                                            y={by - 9}
                                            width="28"
                                            height="18"
                                            rx="4"
                                            fill="#FFFFFF"
                                            stroke="#F59E0B"
                                            strokeWidth="1.2"
                                            filter="url(#badge-shadow)"
                                        />
                                        <text
                                            x={bx}
                                            y={by + 4}
                                            textAnchor="middle"
                                            fontSize="10px"
                                            fontWeight="800"
                                            fill="#D97706"
                                            fontFamily="'Outfit', sans-serif"
                                        >
                                            {angle}°
                                        </text>
                                    </g>
                                );
                            })}

                            {/* ================================================================= */}
                            {/* 3. GRAPH NODES (Green Source, Yellow Intersection, Red Unload)   */}
                            {/* ================================================================= */}
                            {nodes.map(node => {
                                const ringColor = getNodeRingColor(node.type);
                                const isSelected = node.id === selectedNodeId;
                                const isBeingDragged = node.id === draggingNodeId;

                                return (
                                    <g
                                        key={node.id}
                                        transform={`translate(${node.x}, ${node.y})`}
                                        onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                        filter="url(#node-shadow)"
                                        style={{ cursor: isBeingDragged ? "grabbing" : "grab" }}
                                    >
                                        <title>{node.label} ({node.type}) - Click & drag to move</title>

                                        {/* Focus ring if selected */}
                                        {isSelected && (
                                            <circle
                                                r="34"
                                                fill="none"
                                                stroke="#3B82F6"
                                                strokeWidth="2"
                                                strokeDasharray="4 3"
                                            />
                                        )}

                                        {/* Outer Colored Ring */}
                                        <circle
                                            r="26"
                                            fill="#FFFFFF"
                                            stroke={ringColor}
                                            strokeWidth="5"
                                        />

                                        {/* Inner White Center */}
                                        <circle
                                            r="20"
                                            fill="#FFFFFF"
                                        />

                                        {/* Node Label Text */}
                                        <text
                                            textAnchor="middle"
                                            dy=".35em"
                                            fontSize="13px"
                                            fontWeight="800"
                                            fill="#1F2937"
                                            fontFamily="'Outfit', sans-serif"
                                            style={{ userSelect: "none" }}
                                        >
                                            {node.label || node.id}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* ================================================================= */}
                            {/* 4. ROBOT DOTS (Minimal AGV Dots moving through path smoothly)    */}
                            {/* ================================================================= */}
                            {/* Active Simulating Dots */}
                            {isSimulating && vehicles.map((veh, idx) => {
                                const color = veh.color || getRobotColor(idx);
                                const heading = veh.heading !== undefined ? veh.heading : 0;
                                const headingRad = (heading * Math.PI) / 180;
                                const turningAngle = veh.turningAngle || 0;

                                return (
                                    <g
                                        key={veh.id || idx}
                                        style={{ transition: "all 0.05s linear" }}
                                    >
                                        {/* Soft outer glow aura */}
                                        <circle
                                            cx={veh.x}
                                            cy={veh.y}
                                            r="16"
                                            fill={color}
                                            opacity="0.22"
                                        />

                                        {/* Main AGV Dot */}
                                        <circle
                                            cx={veh.x}
                                            cy={veh.y}
                                            r="9"
                                            fill={color}
                                            stroke="#FFFFFF"
                                            strokeWidth="2.5"
                                            filter="url(#badge-shadow)"
                                        />

                                        {/* Direction Pointer Dot */}
                                        <circle
                                            cx={veh.x + Math.cos(headingRad) * 11}
                                            cy={veh.y + Math.sin(headingRad) * 11}
                                            r="2.5"
                                            fill="#111827"
                                        />

                                        {/* Minimal Robot Label Badge */}
                                        <g transform={`translate(${veh.x}, ${veh.y - 18})`}>
                                            <rect
                                                x="-20"
                                                y="-10"
                                                width="40"
                                                height="13"
                                                rx="3"
                                                fill="#111827"
                                                opacity="0.85"
                                            />
                                            <text
                                                x="0"
                                                y="-1"
                                                textAnchor="middle"
                                                fontSize="8.5px"
                                                fontWeight="700"
                                                fill="#FFFFFF"
                                                fontFamily="'Outfit', sans-serif"
                                            >
                                                R{idx + 1} {turningAngle > 0 ? `(${turningAngle}°)` : ""}
                                            </text>
                                        </g>
                                    </g>
                                );
                            })}

                            {/* Idle Stationed Dots at Starting Loading Docks when NOT simulating */}
                            {!isSimulating && idleVehicles.map((veh) => (
                                <g key={veh.id} transform={`translate(${veh.x}, ${veh.y})`}>
                                    <circle
                                        r="14"
                                        fill={veh.color}
                                        opacity="0.18"
                                    />
                                    <circle
                                        r="8.5"
                                        fill={veh.color}
                                        stroke="#FFFFFF"
                                        strokeWidth="2"
                                    />
                                    <rect
                                        x="-16"
                                        y="-24"
                                        width="32"
                                        height="12"
                                        rx="3"
                                        fill="#374151"
                                        opacity="0.85"
                                    />
                                    <text
                                        x="0"
                                        y="-15"
                                        textAnchor="middle"
                                        fontSize="8px"
                                        fontWeight="700"
                                        fill="#FFFFFF"
                                        fontFamily="'Outfit', sans-serif"
                                    >
                                        R{veh.robotId + 1}
                                    </text>
                                </g>
                            ))}
                        </g>
                    </svg>

                    {/* Canvas Floating Tip */}
                    <div style={{
                        position: "absolute",
                        bottom: "14px",
                        left: "14px",
                        background: "rgba(255, 255, 255, 0.94)",
                        backdropFilter: "blur(6px)",
                        border: "1px solid #E5E7EB",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                        fontSize: "11px",
                        color: "#4B5563",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        pointerEvents: "none"
                    }}>
                        <Move size={12} style={{ color: "#10B981" }} />
                        <span><strong>Adjust:</strong> Drag nodes to move. Click <strong>distances</strong> or <strong>angles</strong> to edit.</span>
                    </div>
                </div>

                {/* ================================================================= */}
                {/* MINIMAL WHITE TERMINAL SET ON THE RIGHT                           */}
                {/* ================================================================= */}
                {!isTerminalCollapsed && (
                    <div style={{
                        width: "350px",
                        height: "100%",
                        background: "#FFFFFF",
                        borderLeft: "1px solid #E5E7EB",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "-1px 0 6px rgba(0,0,0,0.02)",
                        zIndex: 10
                    }}>
                        {/* Terminal Header */}
                        <div style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid #E5E7EB",
                            background: "#FAFAFA",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Terminal size={14} style={{ color: "#10B981" }} />
                                <span style={{ fontWeight: 700, fontSize: "13px", color: "#111827" }}>
                                    Fleet Terminal
                                </span>
                            </div>
                            <span style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: isSimulating ? "#ECFDF5" : "#F3F4F6",
                                color: isSimulating ? "#059669" : "#6B7280"
                            }}>
                                {isSimulating ? "SIMULATING" : "STANDBY"}
                            </span>
                        </div>

                        {/* Robot Fleet Status Cards */}
                        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", overflowY: "auto", maxHeight: "250px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                                Robot Fleet Status
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {Array.from({ length: vehicleCount }).map((_, idx) => {
                                    const veh = vehicles.find((v, vidx) => (v.id && v.id.includes(`-${idx}-`)) || vidx === idx);
                                    const route = robotRoutes.find(r => r.id === idx) || {};
                                    const startNode = nodes.find(n => n.id === route.startNodeId);
                                    const endNode = nodes.find(n => n.id === route.endNodeId);
                                    const color = getRobotColor(idx);

                                    const heading = veh?.heading !== undefined ? Math.round(veh.heading) : 0;
                                    const turningAngle = veh?.turningAngle !== undefined ? veh.turningAngle : 90;
                                    const status = isSimulating ? (veh?.status || "MOVING") : "READY";

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                background: "#F9FAFB",
                                                border: "1px solid #E5E7EB",
                                                borderRadius: "8px",
                                                padding: "8px 10px",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "4px"
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    <span style={{
                                                        width: "10px",
                                                        height: "10px",
                                                        borderRadius: "50%",
                                                        background: color,
                                                        display: "inline-block"
                                                    }} />
                                                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#111827" }}>
                                                        Robot {idx + 1}
                                                    </span>
                                                </div>
                                                <span style={{
                                                    fontSize: "9px",
                                                    fontWeight: 700,
                                                    padding: "2px 5px",
                                                    borderRadius: "3px",
                                                    background: isSimulating ? "#E0F2FE" : "#F3F4F6",
                                                    color: isSimulating ? "#0284C7" : "#6B7280"
                                                }}>
                                                    {status}
                                                </span>
                                            </div>

                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "11px", marginTop: "2px" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#4B5563" }}>
                                                    <Compass size={11} style={{ color: "#3B82F6", transform: `rotate(${heading}deg)` }} />
                                                    <span>Heading: <strong>{heading}°</strong></span>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#4B5563" }}>
                                                    <Activity size={11} style={{ color: "#F59E0B" }} />
                                                    <span>Angle: <strong>{turningAngle}°</strong></span>
                                                </div>
                                            </div>

                                            <div style={{ fontSize: "10px", color: "#6B7280" }}>
                                                Route: <strong>{startNode?.label || "L1"}</strong> ➔ <strong>{endNode?.label || "U1"}</strong>
                                                <span style={{ marginLeft: "6px" }}>Speed: {route.speedCmPerSec || 50} cm/s</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Terminal Filter Controls */}
                        <div style={{
                            padding: "8px 16px",
                            borderBottom: "1px solid #E5E7EB",
                            background: "#FAFAFA",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <button
                                    onClick={() => setSelectedRobotFilter("all")}
                                    style={{
                                        padding: "3px 7px",
                                        borderRadius: "5px",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        border: "none",
                                        background: selectedRobotFilter === "all" ? "#111827" : "#E5E7EB",
                                        color: selectedRobotFilter === "all" ? "#FFFFFF" : "#4B5563"
                                    }}
                                >
                                    All
                                </button>
                                {Array.from({ length: vehicleCount }).map((_, rIdx) => (
                                    <button
                                        key={rIdx}
                                        onClick={() => setSelectedRobotFilter(rIdx)}
                                        style={{
                                            padding: "3px 7px",
                                            borderRadius: "5px",
                                            fontSize: "10px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            border: "none",
                                            background: selectedRobotFilter === rIdx ? "#111827" : "#E5E7EB",
                                            color: selectedRobotFilter === rIdx ? "#FFFFFF" : "#4B5563"
                                        }}
                                    >
                                        R{rIdx + 1}
                                    </button>
                                ))}
                            </div>

                            {setActiveLogs && (
                                <button
                                    onClick={() => setActiveLogs([])}
                                    style={{ background: "transparent", border: "none", color: "#9CA3AF", fontSize: "10px", cursor: "pointer", fontWeight: 600 }}
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* Live Monospace Logs */}
                        <div style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: "10px 14px",
                            background: "#F9FAFB",
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: "10.5px",
                            lineHeight: "1.5",
                            display: "flex",
                            flexDirection: "column",
                            gap: "5px"
                        }}>
                            {displayedLogs.length === 0 ? (
                                <div style={{ color: "#9CA3AF", textAlign: "center", marginTop: "30px" }}>
                                    Logs ready. Start simulation to see live traversal.
                                </div>
                            ) : (
                                displayedLogs.map((log) => {
                                    let textColor = "#374151";
                                    let badgeBg = "#E5E7EB";
                                    let badgeColor = "#4B5563";

                                    if (log.type === "success") {
                                        textColor = "#059669";
                                        badgeBg = "#ECFDF5";
                                        badgeColor = "#059669";
                                    } else if (log.type === "scheduler") {
                                        textColor = "#D97706";
                                        badgeBg = "#FEF3C7";
                                        badgeColor = "#D97706";
                                    } else if (log.type === "planner") {
                                        textColor = "#2563EB";
                                        badgeBg = "#EFF6FF";
                                        badgeColor = "#2563EB";
                                    }

                                    return (
                                        <div key={log.id} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                <span style={{ fontSize: "8.5px", fontWeight: 700, padding: "1px 4px", borderRadius: "3px", background: badgeBg, color: badgeColor }}>
                                                    {log.type.toUpperCase()}
                                                </span>
                                                <span style={{ fontSize: "9.5px", color: "#9CA3AF" }}>
                                                    {log.time >= 0 ? `+${log.time.toFixed(2)}s` : "PLAN"}
                                                </span>
                                            </div>
                                            <span style={{ color: textColor, wordBreak: "break-word" }}>
                                                {log.text}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={terminalEndRef} />
                        </div>
                    </div>
                )}
            </div>

            {/* ================================================================= */}
            {/* MINIMAL MODAL: EDIT DISTANCE                                      */}
            {/* ================================================================= */}
            {editingEdge && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 100
                }}>
                    <div style={{
                        background: "#FFFFFF",
                        borderRadius: "10px",
                        padding: "16px 20px",
                        width: "300px",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                                Edit Path Distance
                            </h3>
                            <button
                                onClick={() => setEditingEdge(null)}
                                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF" }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label style={{ fontSize: "11px", color: "#6B7280" }}>Distance (centimeters)</label>
                            <input
                                type="number"
                                min="10"
                                max="10000"
                                value={distanceInput}
                                onChange={(e) => setDistanceInput(e.target.value)}
                                autoFocus
                                style={{
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid #D1D5DB",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    outline: "none"
                                }}
                            />
                        </div>

                        {/* Quick Presets */}
                        <div style={{ display: "flex", gap: "4px" }}>
                            {[500, 1000, 1500, 2000].map(val => (
                                <button
                                    key={val}
                                    onClick={() => setDistanceInput(val.toString())}
                                    style={{
                                        flex: 1,
                                        padding: "3px",
                                        borderRadius: "5px",
                                        border: "1px solid #E5E7EB",
                                        background: "#F9FAFB",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}
                                >
                                    {val}cm
                                </button>
                            ))}
                        </div>

                        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                            <button
                                onClick={() => setEditingEdge(null)}
                                style={{
                                    flex: 1,
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "1px solid #E5E7EB",
                                    background: "#FFFFFF",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    color: "#4B5563"
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveDistance}
                                style={{
                                    flex: 1,
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "none",
                                    background: "#10B981",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    color: "#FFFFFF"
                                }}
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================================================================= */}
            {/* MINIMAL MODAL: EDIT ANGLE                                        */}
            {/* ================================================================= */}
            {editingNodeAngle && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 100
                }}>
                    <div style={{
                        background: "#FFFFFF",
                        borderRadius: "10px",
                        padding: "16px 20px",
                        width: "300px",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                                Edit Turn Angle ({editingNodeAngle.label || editingNodeAngle.id})
                            </h3>
                            <button
                                onClick={() => setEditingNodeAngle(null)}
                                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF" }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <label style={{ fontSize: "11px", color: "#6B7280" }}>Turn Angle (0° - 360°)</label>
                            <input
                                type="number"
                                min="0"
                                max="360"
                                value={angleInput}
                                onChange={(e) => setAngleInput(e.target.value)}
                                autoFocus
                                style={{
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid #D1D5DB",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    outline: "none"
                                }}
                            />
                        </div>

                        {/* Quick Presets */}
                        <div style={{ display: "flex", gap: "4px" }}>
                            {[45, 90, 135, 180].map(val => (
                                <button
                                    key={val}
                                    onClick={() => setAngleInput(val.toString())}
                                    style={{
                                        flex: 1,
                                        padding: "3px",
                                        borderRadius: "5px",
                                        border: "1px solid #E5E7EB",
                                        background: "#F9FAFB",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}
                                >
                                    {val}°
                                </button>
                            ))}
                        </div>

                        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                            <button
                                onClick={() => setEditingNodeAngle(null)}
                                style={{
                                    flex: 1,
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "1px solid #E5E7EB",
                                    background: "#FFFFFF",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    color: "#4B5563"
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAngle}
                                style={{
                                    flex: 1,
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "none",
                                    background: "#F59E0B",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    color: "#FFFFFF"
                                }}
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
