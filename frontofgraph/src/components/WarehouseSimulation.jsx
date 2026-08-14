import React, { useState, useEffect, useRef } from "react";
import styles from "../styles/CreatePathStyles";
import { useNavigate } from "react-router-dom";
import {
    Play,
    Square,
    ArrowLeft,
    Layers,
    Bot,
    Edit
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

export default function WarehouseSimulation() {
    const navigate = useNavigate();
    const svgRef = useRef(null);

    // Key and Session States
    const [plotKey, setPlotKey] = useState(localStorage.getItem("palletron_plot_key") || "");
    const [authError, setAuthError] = useState("");

    // Graph States
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);

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

    // Load data by key on mount
    useEffect(() => {
        if (!plotKey) {
            navigate("/");
        } else {
            fetchPlotData(plotKey);
        }
    }, [plotKey, navigate]);

    // Fetch details and layout by key
    const fetchPlotData = async (key) => {
        try {
            setAuthError("");
            const response = await fetch(`http://localhost:8080/api/plots/${encodeURIComponent(key)}`);
            if (!response.ok) {
                throw new Error("Unable to contact backend server.");
            }
            const data = await response.json();

            // If configuration has not been set, redirect to parameters configurator
            if (data.loadingPoints === undefined || data.loadingPoints === null) {
                navigate("/configure");
                return;
            }

            if (data.canvasData) {
                const parsed = JSON.parse(data.canvasData);
                setNodes(parsed.nodes || []);
                setEdges(parsed.edges || []);
                setVehicleCount(parsed.vehicleCount || data.noOfRobots || 3);
            } else {
                // Not plotted yet, redirect to editor
                navigate("/editor");
            }
        } catch (err) {
            setAuthError(err.message);
        }
    };

    // Toggle simulation
    const toggleSimulation = () => {
        if (isSimulating) {
            setIsSimulating(false);
            setVehicles([]);
        } else {
            const loadingNodes = nodes.filter(n => n.type === "loading");
            const unloadingNodes = nodes.filter(n => n.type === "unloading");

            if (loadingNodes.length === 0 || unloadingNodes.length === 0) {
                alert("Please ensure you have at least one Loading Point and one Unloading Point to simulate!");
                return;
            }

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
                        speed: 0.015 + Math.random() * 0.01,
                        color: `hsl(${200 + i * 40}, 90%, 60%)`,
                        x: startNode.x,
                        y: startNode.y
                    });
                }
            }

            if (newVehicles.length === 0) {
                alert("No connected paths found from Loading to Unloading points!");
                return;
            }

            setVehicles(newVehicles);
            setIsSimulating(true);
        }
    };

    // Simulation animation loop
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

                    const fromNode = nodes.find(n => n.id === path[currentStep]);
                    const toNode = nodes.find(n => n.id === path[currentStep + 1]);

                    if (!fromNode || !toNode) return veh;

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
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isSimulating, nodes, edges]);

    const handleLogout = () => {
        localStorage.removeItem("palletron_plot_key");
        setPlotKey("");
        navigate("/");
    };

    const handleCanvasMouseDown = (e) => {
        setMouseDownPos({ x: e.clientX, y: e.clientY });
        if (e.target.tagName !== "svg" && e.target.id !== "canvas-bg") return;
        setIsPanning(true);
        setPanStart({
            x: e.clientX - panOffset.x,
            y: e.clientY - panOffset.y
        });
    };

    const handleCanvasMouseMove = (e) => {
        if (isPanning) {
            setPanOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
        }
    };

    const handleCanvasMouseUp = () => {
        setIsPanning(false);
    };

    const adjustZoom = (factor) => {
        setZoom(prev => Math.min(Math.max(prev * factor, 0.4), 4.0));
    };

    const resetZoom = () => {
        setZoom(1.0);
        setPanOffset({ x: 0, y: 0 });
    };

    // Zoom via mouse wheel
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

    const getNodeColor = (type) => {
        switch (type) {
            case "loading": return "16, 185, 129";
            case "unloading": return "249, 115, 22";
            case "intersection": return "156, 163, 175";
            default: return "255, 255, 255";
        }
    };

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
                        Fleet Simulator
                    </h1>
                    <p style={styles.subtitle}>
                        Run real-time pathfinding routing simulations for autonomous vehicles.
                    </p>
                </div>

                <div style={styles.stepsContainer}>
                    <div style={styles.step} onClick={() => navigate("/configure")}>
                        <div style={styles.stepNumber}>✓</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Configure Fleet</span>
                            <span style={styles.stepDesc}>Setup counts & parameters</span>
                        </div>
                    </div>

                    <div style={styles.step} onClick={() => navigate("/editor")}>
                        <div style={styles.stepNumber}>✓</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Create Nodes</span>
                            <span style={styles.stepDesc}>Place loaders, unloaders & intersections</span>
                        </div>
                    </div>

                    <div style={styles.activeStep}>
                        <div style={styles.stepNumber}>3</div>
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
                        <h2 style={styles.headerTitle}>Live Simulation Canvas</h2>
                        <span style={styles.headerSubtitle}>
                            {isSimulating ? "Simulation running: AGVs navigating via shortest path" : "Simulation stopped. Click Simulate to start."}
                        </span>
                    </div>

                    {/* Toolbar */}
                    <div style={styles.toolbar}>
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
                            {isSimulating ? "Stop Simulation" : "Start Simulation"}
                        </button>

                        <div style={styles.toolDivider} />

                        <div style={styles.vehicleCountContainer} title="Active Robot Count">
                            <Bot size={14} style={{ color: "#9CA3AF" }} />
                            <span style={styles.vehicleCountLabel}>Robots: {vehicleCount}</span>
                        </div>

                        <button
                            onClick={() => navigate("/editor")}
                            style={styles.primaryButton}
                        >
                            <Edit size={14} />
                            Edit Nodes
                        </button>

                        <div style={styles.toolDivider} />

                        <span style={{ fontSize: "12px", color: "#10B981", background: "rgba(16, 185, 129, 0.1)", padding: "6px 12px", borderRadius: "8px", fontWeight: "bold" }}>
                            KEY: {plotKey}
                        </span>

                        <button
                            onClick={handleLogout}
                            style={{
                                ...styles.toolButton,
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                color: "#EF4444"
                            }}
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Canvas Container */}
                <div style={styles.canvas}>
                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        id="canvas-svg"
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={handleCanvasMouseUp}
                        style={{ cursor: isPanning ? "grabbing" : "default" }}
                    >
                        <defs>
                            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
                            </pattern>
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
                        </defs>

                        <rect id="canvas-bg" width="100%" height="100%" fill="url(#grid)" />

                        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
                            {/* Path Lines (Edges) */}
                            {edges.map(edge => {
                                const fromNode = nodes.find(n => n.id === edge.from);
                                const toNode = nodes.find(n => n.id === edge.to);
                                if (!fromNode || !toNode) return null;

                                return (
                                    <g key={edge.id}>
                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke="rgba(255, 255, 255, 0.08)"
                                            strokeWidth="3.5"
                                            strokeLinecap="round"
                                        />

                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke="rgba(255, 255, 255, 0.15)"
                                            strokeWidth="1.5"
                                            markerEnd="url(#arrow)"
                                            strokeLinecap="round"
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
                                                        stroke="rgba(255, 255, 255, 0.12)"
                                                        strokeWidth="1"
                                                    />
                                                    <text
                                                        textAnchor="middle"
                                                        dy=".3em"
                                                        fontSize="9px"
                                                        fontWeight="700"
                                                        fill="#FFFFFF"
                                                    >
                                                        <tspan fill="#10B981">{mult.toFixed(1)}x</tspan>
                                                        <tspan fill="rgba(255, 255, 255, 0.2)"> | </tspan>
                                                        <tspan fill="#3B82F6">{dist.toFixed(0)}m</tspan>
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

                                return (
                                    <g
                                        key={node.id}
                                        transform={`translate(${node.x}, ${node.y})`}
                                    >
                                        <circle
                                            r="20"
                                            fill="#070707"
                                            stroke={`rgba(${rgbColor}, 0.25)`}
                                            strokeWidth="1.5"
                                        />

                                        <circle
                                            r="18"
                                            fill={`rgba(${rgbColor}, 0.08)`}
                                            stroke={`rgba(${rgbColor}, 0.65)`}
                                            strokeWidth="1.5"
                                        />

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
                                    <circle
                                        cx={vehicle.x}
                                        cy={vehicle.y}
                                        r="10"
                                        fill={vehicle.color}
                                        opacity="0.25"
                                        style={{ filter: "blur(4px)" }}
                                    />
                                    <circle
                                        cx={vehicle.x}
                                        cy={vehicle.y}
                                        r="6.5"
                                        fill={vehicle.color}
                                        stroke="#FFFFFF"
                                        strokeWidth="1.5"
                                    />
                                </g>
                            ))}
                        </g>
                    </svg>

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
}
