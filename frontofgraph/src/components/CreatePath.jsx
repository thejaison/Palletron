import React, { useState, useEffect, useRef } from "react";
import styles from "../styles/CreatePathStyles";
import { useNavigate } from "react-router-dom";
import {
    Play,
    Square,
    Plus,
    Link2,
    Trash2,
    MousePointer,
    RefreshCw,
    ArrowRight,
    Layers,
    Sparkles,
    HelpCircle,
    Bot
} from "lucide-react";

// Helper for BFS Pathfinding
const findPath = (start, end, nodes, edges) => {
    const queue = [[start]];
    const visited = new Set([start]);
    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        if (current === end) return path;

        // Find outbound neighbors
        const neighbors = edges
            .filter(e => e.from === current)
            .map(e => e.to);

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }
    return null;
};

const CreatePath = () => {
    const navigate = useNavigate();
    const svgRef = useRef(null);

    // Graph States
    const [nodes, setNodes] = useState([
        { id: "n1", label: "L1", x: 180, y: 150, type: "loading" },
        { id: "n2", label: "L2", x: 180, y: 350, type: "loading" },
        { id: "n3", label: "I1", x: 380, y: 250, type: "intersection" },
        { id: "n4", label: "U1", x: 580, y: 150, type: "unloading" },
        { id: "n5", label: "U2", x: 580, y: 350, type: "unloading" }
    ]);

    const [edges, setEdges] = useState([
        { id: "e1", from: "n1", to: "n3" },
        { id: "e2", from: "n2", to: "n3" },
        { id: "e3", from: "n3", to: "n4" },
        { id: "e4", from: "n3", to: "n5" }
    ]);

    // UI Control States
    const [mode, setMode] = useState("select"); // select, add, connect, delete
    const [activeNodeType, setActiveNodeType] = useState("loading"); // loading, unloading, intersection
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);
    const [connectingStartId, setConnectingStartId] = useState(null);
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Pan & Zoom States
    const [zoom, setZoom] = useState(1.0);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 });

    // Simulation States
    const [isSimulating, setIsSimulating] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [vehicleCount, setVehicleCount] = useState(3);
    const animationFrameRef = useRef(null);

    // Node colors helper
    const getNodeColor = (type) => {
        switch (type) {
            case "loading": return "16, 185, 129";      // Emerald/Teal
            case "unloading": return "249, 115, 22";     // Orange
            case "intersection": return "156, 163, 175"; // Grey
            default: return "255, 255, 255";
        }
    };

    // Toggle simulation
    const toggleSimulation = () => {
        if (isSimulating) {
            setIsSimulating(false);
            setVehicles([]);
        } else {
            // Find all loading and unloading nodes
            const loadingNodes = nodes.filter(n => n.type === "loading");
            const unloadingNodes = nodes.filter(n => n.type === "unloading");

            if (loadingNodes.length === 0 || unloadingNodes.length === 0) {
                alert("Please ensure you have at least one Loading Point and one Unloading Point to simulate!");
                return;
            }

            // Create initial vehicles starting at loading nodes
            const newVehicles = [];
            for (let i = 0; i < vehicleCount; i++) {
                const startNode = loadingNodes[i % loadingNodes.length];
                const endNode = unloadingNodes[Math.floor(Math.random() * unloadingNodes.length)];
                const path = findPath(startNode.id, endNode.id, nodes, edges);

                if (path) {
                    newVehicles.push({
                        id: `v-${i}-${Date.now()}`,
                        path,
                        currentStep: 0,
                        progress: 0,
                        speed: 0.015 + Math.random() * 0.01, // random speeds
                        color: `hsl(${200 + i * 40}, 90%, 60%)`,
                        x: startNode.x,
                        y: startNode.y
                    });
                }
            }

            if (newVehicles.length === 0) {
                alert("No connected paths found from Loading to Unloading points. Connect them in 'Connect' mode!");
                return;
            }

            setVehicles(newVehicles);
            setIsSimulating(true);
            setMode("select"); // switch out of edit modes during simulation
        }
    };

    // Reset Canvas
    const resetCanvas = () => {
        setNodes([]);
        setEdges([]);
        setVehicles([]);
        setIsSimulating(false);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setConnectingStartId(null);
        setMode("select");
    };

    // SVG coordinate helper
    const getSVGCoordinates = (e) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        return {
            x: (screenX - panOffset.x) / zoom,
            y: (screenY - panOffset.y) / zoom
        };
    };

    // Handle Canvas background drag-pan starts
    const handleCanvasMouseDown = (e) => {
        setMouseDownPos({ x: e.clientX, y: e.clientY });

        if (e.target.tagName !== "svg" && e.target.id !== "canvas-bg") return;

        setIsPanning(true);
        setPanStart({
            x: e.clientX - panOffset.x,
            y: e.clientY - panOffset.y
        });
    };

    // Handle Canvas background clicks (adds new nodes)
    const handleCanvasClick = (e) => {
        if (isSimulating) return;

        // Prevent click if we dragged/panned more than 5px
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            return;
        }

        // Ensure we only click the background, not nodes
        if (e.target.tagName !== "svg" && e.target.id !== "canvas-bg") return;

        if (mode === "add") {
            const { x, y } = getSVGCoordinates(e);

            // Generate next available number label
            const typeCount = nodes.filter(n => n.type === activeNodeType).length + 1;
            let prefix = "I";
            if (activeNodeType === "loading") prefix = "L";
            if (activeNodeType === "unloading") prefix = "U";

            const newNode = {
                id: `node-${Date.now()}`,
                label: `${prefix}${typeCount}`,
                x: Math.round(x / 10) * 10, // Snap to grid
                y: Math.round(y / 10) * 10,
                type: activeNodeType
            };

            setNodes([...nodes, newNode]);
        } else {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            setConnectingStartId(null);
        }
    };

    // Handle Node interactions
    const handleNodeMouseDown = (e, node) => {
        if (isSimulating) return;
        e.stopPropagation();

        if (mode === "delete") {
            // Delete node and its edges
            setNodes(nodes.filter(n => n.id !== node.id));
            setEdges(edges.filter(edge => edge.from !== node.id && edge.to !== node.id));
            if (selectedNodeId === node.id) setSelectedNodeId(null);
        } else if (mode === "connect") {
            if (!connectingStartId) {
                setConnectingStartId(node.id);
            } else {
                if (connectingStartId !== node.id) {
                    // Check if edge already exists
                    const exists = edges.some(edge =>
                        (edge.from === connectingStartId && edge.to === node.id) ||
                        (edge.from === node.id && edge.to === connectingStartId)
                    );
                    if (!exists) {
                        setEdges([...edges, {
                            id: `edge-${Date.now()}`,
                            from: connectingStartId,
                            to: node.id,
                            speedMultiplier: 1.0,
                            distance: 10.0
                        }]);
                    }
                }
                setConnectingStartId(null);
            }
        } else {
            // Select and drag
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
            setDraggingNodeId(node.id);
            const { x, y } = getSVGCoordinates(e);
            setDragOffset({
                x: x - node.x,
                y: y - node.y
            });
        }
    };

    // Handle Edge clicks
    const handleEdgeClick = (e, edge) => {
        e.stopPropagation();

        if (mode === "delete") {
            if (isSimulating) return; // safety
            setEdges(edges.filter(item => item.id !== edge.id));
            if (selectedEdgeId === edge.id) setSelectedEdgeId(null);
        } else {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
            setConnectingStartId(null);
        }
    };

    // Update edge properties
    const handleUpdateEdgeProp = (edgeId, key, value) => {
        setEdges(prevEdges => prevEdges.map(edge => {
            if (edge.id === edgeId) {
                return { ...edge, [key]: value };
            }
            return edge;
        }));
    };

    // Drag move handler
    const handleCanvasMouseMove = (e) => {
        if (isPanning) {
            setPanOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
            return;
        }

        if (draggingNodeId && !isSimulating) {
            const { x, y } = getSVGCoordinates(e);
            setNodes(nodes.map(n => {
                if (n.id === draggingNodeId) {
                    return {
                        ...n,
                        x: Math.min(Math.max(20, Math.round((x - dragOffset.x) / 10) * 10), 800),
                        y: Math.min(Math.max(20, Math.round((y - dragOffset.y) / 10) * 10), 500)
                    };
                }
                return n;
            }));
        }
    };

    // Drag end handler
    const handleCanvasMouseUp = () => {
        setDraggingNodeId(null);
        setIsPanning(false);
    };

    // Simulation loop
    useEffect(() => {
        if (!isSimulating) return;

        const updateVehicles = () => {
            setVehicles(prevVehicles => {
                return prevVehicles.map(veh => {
                    let { path, currentStep, progress, speed } = veh;
                    let multiplier = 1.0;
                    let segmentDistance = 10.0;
                    if (currentStep < path.length - 1) {
                        const fromId = path[currentStep];
                        const toId = path[currentStep + 1];
                        const currentEdge = edges.find(e =>
                            (e.from === fromId && e.to === toId) ||
                            (e.from === toId && e.to === fromId)
                        );
                        multiplier = currentEdge?.speedMultiplier || 1.0;
                        segmentDistance = currentEdge?.distance || 10.0;
                    }

                    progress += (speed * multiplier) / (segmentDistance / 10.0);

                    if (progress >= 1) {
                        progress = 0;
                        currentStep += 1;
                    }

                    // Reached end of path, target next random path
                    if (currentStep >= path.length - 1) {
                        const loadingNodes = nodes.filter(n => n.type === "loading");
                        const unloadingNodes = nodes.filter(n => n.type === "unloading");
                        const startNode = loadingNodes[Math.floor(Math.random() * loadingNodes.length)] || nodes[0];
                        const endNode = unloadingNodes[Math.floor(Math.random() * unloadingNodes.length)] || nodes[nodes.length - 1];

                        const newPath = findPath(startNode.id, endNode.id, nodes, edges);
                        return {
                            ...veh,
                            path: newPath || [startNode.id],
                            currentStep: 0,
                            progress: 0,
                            x: startNode.x,
                            y: startNode.y
                        };
                    }

                    // Interpolate position
                    const fromNode = nodes.find(n => n.id === path[currentStep]);
                    const toNode = nodes.find(n => n.id === path[currentStep + 1]);

                    if (!fromNode || !toNode) {
                        return veh; // fallback
                    }

                    const currentX = fromNode.x + (toNode.x - fromNode.x) * progress;
                    const currentY = fromNode.y + (toNode.y - fromNode.y) * progress;

                    return {
                        ...veh,
                        currentStep,
                        progress,
                        x: currentX,
                        y: currentY
                    };
                });
            });

            animationFrameRef.current = requestAnimationFrame(updateVehicles);
        };

        animationFrameRef.current = requestAnimationFrame(updateVehicles);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isSimulating, nodes, edges]);

    // Zoom control helpers
    const adjustZoom = (factor) => {
        setZoom(prev => Math.min(Math.max(prev * factor, 0.4), 4.0));
    };

    const resetZoom = () => {
        setZoom(1.0);
        setPanOffset({ x: 0, y: 0 });
    };

    // Zoom via mouse wheel (centers zoom on mouse cursor)
    useEffect(() => {
        const svgEl = svgRef.current;
        if (!svgEl) return;

        const handleWheelRaw = (e) => {
            e.preventDefault();
            const zoomFactor = 1.08;
            let newZoom = zoom;

            if (e.deltaY < 0) {
                newZoom = Math.min(zoom * zoomFactor, 4.0);
            } else {
                newZoom = Math.max(zoom / zoomFactor, 0.4);
            }

            if (newZoom !== zoom) {
                const rect = svgEl.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Adjust panOffset so mouse point stays fixed
                const dx = mouseX - panOffset.x;
                const dy = mouseY - panOffset.y;

                setPanOffset({
                    x: mouseX - dx * (newZoom / zoom),
                    y: mouseY - dy * (newZoom / zoom)
                });
                setZoom(newZoom);
            }
        };

        svgEl.addEventListener("wheel", handleWheelRaw, { passive: false });
        return () => {
            svgEl.removeEventListener("wheel", handleWheelRaw);
        };
    }, [zoom, panOffset]);

    return (
        <div style={styles.page}>
            {/* Left Panel */}
            <div style={styles.leftPanel}>
                <div>
                    <div style={styles.brand}>
                        <Layers size={16} />
                        Palletron UI
                    </div>
                    <h1 style={styles.title}>
                        Warehouse
                        <br />
                        Graph Builder
                    </h1>
                    <p style={styles.subtitle}>
                        Design vertices, connect conveyor paths, and simulate autonomous guided vehicles in real-time.
                    </p>
                </div>

                <div style={styles.stepsContainer}>
                    <div style={styles.activeStep}>
                        <div style={styles.stepNumber}>1</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Create Nodes</span>
                            <span style={styles.stepDesc}>Place loaders, unloaders & intersections</span>
                        </div>
                    </div>

                    <div style={styles.step} onClick={() => navigate("/warehouse/create")}>
                        <div style={styles.inactiveStepNumber}>2</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Configure Fleet</span>
                            <span style={styles.stepDesc}>Setup counts & parameters</span>
                        </div>
                    </div>

                    <div style={styles.step} onClick={() => navigate("/warehouse/create")}>
                        <div style={styles.inactiveStepNumber}>3</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Run Simulation</span>
                            <span style={styles.stepDesc}>Solve logistics routing</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel */}
            <div style={styles.rightPanel}>
                <div style={styles.headerRow}>
                    <div style={styles.headerInfo}>
                        <h2 style={styles.headerTitle}>Interactive Simulation Canvas</h2>
                        <span style={styles.headerSubtitle}>
                            {isSimulating ? "Simulation running: AGVs navigating via shortest path" : "Drag nodes to move. Toggle modes below to design."}
                        </span>
                    </div>

                    {/* Toolbar */}
                    <div style={styles.toolbar}>
                        <button
                            style={mode === "select" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("select"); setConnectingStartId(null); }}
                            disabled={isSimulating}
                        >
                            <MousePointer size={14} />
                            Select / Move
                        </button>

                        <button
                            style={mode === "add" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("add"); setConnectingStartId(null); }}
                            disabled={isSimulating}
                        >
                            <Plus size={14} />
                            Add Node
                        </button>

                        {/* Node Type Selector inside Add Mode */}
                        {mode === "add" && (
                            <div style={styles.nodeTypeSelector}>
                                <button
                                    style={activeNodeType === "loading" ? styles.nodeTypeBtnActive("16, 185, 129") : styles.nodeTypeBtn}
                                    onClick={() => setActiveNodeType("loading")}
                                >
                                    Loading
                                </button>
                                <button
                                    style={activeNodeType === "unloading" ? styles.nodeTypeBtnActive("249, 115, 22") : styles.nodeTypeBtn}
                                    onClick={() => setActiveNodeType("unloading")}
                                >
                                    Unloading
                                </button>
                                <button
                                    style={activeNodeType === "intersection" ? styles.nodeTypeBtnActive("156, 163, 175") : styles.nodeTypeBtn}
                                    onClick={() => setActiveNodeType("intersection")}
                                >
                                    Intersection
                                </button>
                            </div>
                        )}

                        <button
                            style={mode === "connect" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("connect"); setSelectedNodeId(null); }}
                            disabled={isSimulating}
                        >
                            <Link2 size={14} />
                            Connect
                        </button>

                        <button
                            style={mode === "delete" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("delete"); setConnectingStartId(null); }}
                            disabled={isSimulating}
                        >
                            <Trash2 size={14} />
                            Delete
                        </button>

                        <div style={styles.toolDivider} />

                        <button
                            style={styles.toolButton}
                            onClick={resetCanvas}
                            disabled={isSimulating}
                        >
                            <RefreshCw size={14} />
                            Reset
                        </button>

                        <div style={styles.toolDivider} />

                        <div style={styles.vehicleCountContainer} title="Configure number of robots to simulate">
                            <Bot size={14} style={{ color: "#9CA3AF" }} />
                            <span style={styles.vehicleCountLabel}>Robots:</span>
                            <input
                                type="number"
                                min="1"
                                max="10"
                                value={vehicleCount}
                                onChange={(e) => {
                                    const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                                    setVehicleCount(val);
                                }}
                                style={styles.vehicleCountInput}
                                disabled={isSimulating}
                            />
                        </div>

                        <button
                            onClick={toggleSimulation}
                            style={{
                                ...styles.activeToolButton,
                                background: isSimulating ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                                border: isSimulating ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                                color: isSimulating ? "#EF4444" : "#10B981"
                            }}
                        >
                            {isSimulating ? <Square size={14} fill="#EF4444" /> : <Play size={14} fill="#10B981" />}
                            {isSimulating ? "Stop" : "Simulate"}
                        </button>

                        <button
                            onClick={() => navigate("/warehouse/create")}
                            style={styles.primaryButton}
                        >
                            Configure Fleet
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Canvas Container */}
                <div style={styles.canvas}>
                    {/* Help hint */}
                    {mode === "add" && (
                        <div style={styles.hint}>
                            <Sparkles size={13} />
                            Click grid coordinates to place a <strong>{activeNodeType}</strong> point
                        </div>
                    )}
                    {mode === "connect" && (
                        <div style={styles.hint}>
                            <HelpCircle size={13} />
                            {connectingStartId ? "Click destination node to create link" : "Click starting node to connect"}
                        </div>
                    )}

                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        id="canvas-svg"
                        onMouseDown={handleCanvasMouseDown}
                        onClick={handleCanvasClick}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp}
                        style={{ cursor: isPanning ? "grabbing" : mode === "add" ? "crosshair" : "default" }}
                    >
                        <defs>
                            {/* Grid Pattern */}
                            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
                            </pattern>

                            {/* Arrow Marker */}
                            <marker
                                id="arrow"
                                viewBox="0 0 10 10"
                                refX="22"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(255,255,255,0.25)" />
                            </marker>

                            {/* Selected Arrow Marker */}
                            <marker
                                id="arrow-selected"
                                viewBox="0 0 10 10"
                                refX="22"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3B82F6" />
                            </marker>
                        </defs>

                        {/* Grid Background */}
                        <rect id="canvas-bg" width="100%" height="100%" fill="url(#grid)" />

                        {/* Transform Group for Pan & Zoom */}
                        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>

                            {/* Path Lines (Edges) */}
                            {edges.map(edge => {
                                const fromNode = nodes.find(n => n.id === edge.from);
                                const toNode = nodes.find(n => n.id === edge.to);
                                if (!fromNode || !toNode) return null;

                                const isSelected = selectedEdgeId === edge.id;

                                return (
                                    <g key={edge.id}>
                                        {/* Selection Glow */}
                                        {isSelected && (
                                            <line
                                                x1={fromNode.x}
                                                y1={fromNode.y}
                                                x2={toNode.x}
                                                y2={toNode.y}
                                                stroke="rgba(59, 130, 246, 0.25)"
                                                strokeWidth="8"
                                                strokeLinecap="round"
                                            />
                                        )}

                                        {/* Underlay thick line */}
                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke={isSelected ? "#3B82F6" : "rgba(255, 255, 255, 0.08)"}
                                            strokeWidth="3.5"
                                            strokeLinecap="round"
                                        />

                                        {/* Inner line with Arrow */}
                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke={isSelected ? "#3B82F6" : "rgba(255, 255, 255, 0.15)"}
                                            strokeWidth="1.5"
                                            markerEnd={isSelected ? "url(#arrow-selected)" : "url(#arrow)"}
                                            strokeLinecap="round"
                                        />

                                        {/* Interactive hover/click area */}
                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke="transparent"
                                            strokeWidth="16"
                                            strokeLinecap="round"
                                            style={{ cursor: "pointer" }}
                                            onClick={(e) => handleEdgeClick(e, edge)}
                                        />

                                        {/* Speed & Distance Badge */}
                                        {(() => {
                                            const midX = (fromNode.x + toNode.x) / 2;
                                            const midY = (fromNode.y + toNode.y) / 2;
                                            const mult = edge.speedMultiplier || 1.0;
                                            const dist = edge.distance || 10.0;

                                            return (
                                                <g
                                                    transform={`translate(${midX}, ${midY})`}
                                                    style={{ pointerEvents: "none", userSelect: "none" }}
                                                >
                                                    <rect
                                                        x="-28"
                                                        y="-8"
                                                        width="56"
                                                        height="16"
                                                        rx="4"
                                                        fill="rgba(7, 7, 7, 0.85)"
                                                        stroke={isSelected ? "#3B82F6" : "rgba(255, 255, 255, 0.12)"}
                                                        strokeWidth={isSelected ? "1.5" : "1"}
                                                    />
                                                    <text
                                                        textAnchor="middle"
                                                        dy=".3em"
                                                        fontSize="9px"
                                                        fontWeight="700"
                                                        fill="#FFFFFF"
                                                    >
                                                        <tspan fill={isSelected ? "#3B82F6" : "#10B981"}>{mult.toFixed(1)}x</tspan>
                                                        <tspan fill="rgba(255, 255, 255, 0.2)"> | </tspan>
                                                        <tspan fill={isSelected ? "#3B82F6" : "#3B82F6"}>{dist.toFixed(0)}m</tspan>
                                                    </text>
                                                </g>
                                            );
                                        })()}
                                    </g>
                                );
                            })}

                            {/* Node Elements */}
                            {nodes.map(node => {
                                const rgbColor = getNodeColor(node.type);
                                const isSelected = selectedNodeId === node.id;
                                const isConnectingStart = connectingStartId === node.id;

                                return (
                                    <g
                                        key={node.id}
                                        transform={`translate(${node.x}, ${node.y})`}
                                        onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                        style={{ cursor: isSimulating ? "default" : "grab" }}
                                    >
                                        {/* Selection Glow */}
                                        {(isSelected || isConnectingStart) && (
                                            <circle
                                                r="26"
                                                fill="none"
                                                stroke={isConnectingStart ? "#3B82F6" : `rgb(${rgbColor})`}
                                                strokeWidth="2"
                                                strokeDasharray="4 4"
                                                className="glow-ring"
                                            />
                                        )}

                                        {/* Node Shadow / Outer Background */}
                                        <circle
                                            r="20"
                                            fill="#070707"
                                            stroke={`rgba(${rgbColor}, 0.25)`}
                                            strokeWidth="1.5"
                                        />

                                        {/* Node Active Center */}
                                        <circle
                                            r="18"
                                            fill={`rgba(${rgbColor}, 0.08)`}
                                            stroke={`rgba(${rgbColor}, 0.65)`}
                                            strokeWidth="1.5"
                                        />

                                        {/* Node Label */}
                                        <text
                                            textAnchor="middle"
                                            dy=".3em"
                                            fill="#FFFFFF"
                                            fontSize="11px"
                                            fontWeight="700"
                                            style={{ userSelect: "none" }}
                                        >
                                            {node.label}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Animated Vehicles (AGVs) */}
                            {isSimulating && vehicles.map(vehicle => (
                                <g key={vehicle.id}>
                                    {/* Vehicle Glow Background */}
                                    <circle
                                        cx={vehicle.x}
                                        cy={vehicle.y}
                                        r="10"
                                        fill={vehicle.color}
                                        opacity="0.25"
                                        style={{ filter: "blur(4px)" }}
                                    />
                                    {/* Vehicle Center */}
                                    <circle
                                        cx={vehicle.x}
                                        cy={vehicle.y}
                                        r="6"
                                        fill={vehicle.color}
                                        stroke="#FFFFFF"
                                        strokeWidth="1.5"
                                        style={{ boxShadow: "0 0 10px rgba(255,255,255,0.8)" }}
                                    />
                                </g>
                            ))}
                        </g> {/* End of Transform Group */}
                    </svg>

                    {/* Floating Inspector Panel for Selected Edge */}
                    {(() => {
                        if (!selectedEdgeId) return null;
                        const selectedEdge = edges.find(e => e.id === selectedEdgeId);
                        if (!selectedEdge) return null;
                        const fromNode = nodes.find(n => n.id === selectedEdge.from);
                        const toNode = nodes.find(n => n.id === selectedEdge.to);

                        return (
                            <div style={styles.inspectorPanel}>
                                <div style={styles.inspectorHeader}>
                                    <span style={styles.inspectorTitle}>Segment Properties</span>
                                    <button
                                        style={styles.inspectorCloseBtn}
                                        onClick={() => setSelectedEdgeId(null)}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div style={styles.inspectorBody}>
                                    <div style={styles.inspectorRow}>
                                        <span style={styles.inspectorLabel}>Conveyor Path</span>
                                        <span style={styles.inspectorValue}>
                                            {fromNode ? fromNode.label : "?"} ➔ {toNode ? toNode.label : "?"}
                                        </span>
                                    </div>
                                    {/* Speed Controller */}
                                    <div style={styles.inspectorRow}>
                                        <span style={styles.inspectorLabel}>Robot Speed</span>
                                        <span style={{ ...styles.inspectorValue, color: "#10B981" }}>
                                            {(selectedEdge.speedMultiplier || 1.0).toFixed(1)}x
                                        </span>
                                    </div>
                                    <div style={styles.inspectorControl}>
                                        <input
                                            type="range"
                                            min="0.2"
                                            max="3.0"
                                            step="0.1"
                                            value={selectedEdge.speedMultiplier || 1.0}
                                            onChange={(e) => handleUpdateEdgeProp(selectedEdge.id, "speedMultiplier", parseFloat(e.target.value))}
                                            style={styles.inspectorSlider}
                                        />
                                        <div style={styles.sliderLabels}>
                                            <span>0.2x (Slow)</span>
                                            <span>1.0x (Normal)</span>
                                            <span>3.0x (Fast)</span>
                                        </div>
                                    </div>
                                    <div style={styles.presetButtons}>
                                        {[0.5, 1.0, 1.5, 2.0].map(val => (
                                            <button
                                                key={val}
                                                style={styles.presetBtn}
                                                onClick={() => handleUpdateEdgeProp(selectedEdge.id, "speedMultiplier", val)}
                                            >
                                                {val.toFixed(1)}x
                                            </button>
                                        ))}
                                    </div>

                                    {/* Distance Controller */}
                                    <div style={{ ...styles.inspectorRow, marginTop: "8px" }}>
                                        <span style={styles.inspectorLabel}>Path Distance</span>
                                        <span style={{ ...styles.inspectorValue, color: "#3B82F6" }}>
                                            {selectedEdge.distance || 10} meters
                                        </span>
                                    </div>
                                    <div style={styles.inspectorControl}>
                                        <input
                                            type="range"
                                            min="2"
                                            max="50"
                                            step="1"
                                            value={selectedEdge.distance || 10}
                                            onChange={(e) => handleUpdateEdgeProp(selectedEdge.id, "distance", parseInt(e.target.value))}
                                            style={styles.inspectorSliderDistance}
                                        />
                                        <div style={styles.sliderLabels}>
                                            <span>2m</span>
                                            <span>10m (Default)</span>
                                            <span>50m</span>
                                        </div>
                                    </div>
                                    <div style={styles.presetButtons}>
                                        {[5, 10, 20, 40].map(val => (
                                            <button
                                                key={val}
                                                style={styles.presetBtn}
                                                onClick={() => handleUpdateEdgeProp(selectedEdge.id, "distance", val)}
                                            >
                                                {val}m
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        style={styles.inspectorDeleteBtn}
                                        onClick={() => {
                                            setEdges(edges.filter(e => e.id !== selectedEdge.id));
                                            setSelectedEdgeId(null);
                                        }}
                                        disabled={isSimulating}
                                    >
                                        <Trash2 size={12} />
                                        Delete Segment
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Canvas Indicators */}
                    <div style={styles.canvasOverlay}>
                        <div style={styles.overlayItem}>
                            <div style={styles.overlayDot("#10B981")} />
                            <span>Loading Points</span>
                        </div>
                        <div style={styles.overlayItem}>
                            <div style={styles.overlayDot("#F97316")} />
                            <span>Unloading Points</span>
                        </div>
                        <div style={styles.overlayItem}>
                            <div style={styles.overlayDot("#9CA3AF")} />
                            <span>Intersections</span>
                        </div>
                    </div>

                    {/* Zoom / Pan Controls */}
                    <div style={styles.zoomControls}>
                        <button style={styles.zoomBtn} onClick={() => adjustZoom(1.15)} title="Zoom In">+</button>
                        <button style={styles.zoomBtn} onClick={() => adjustZoom(1 / 1.15)} title="Zoom Out">-</button>
                        <button style={{ ...styles.zoomBtn, fontSize: "10px", width: "auto", padding: "0 8px" }} onClick={resetZoom} title="Reset view">Reset</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreatePath;