import React, { useState, useEffect, useRef } from "react";
import styles from "../styles/CreatePathStyles";
import { useNavigate } from "react-router-dom";
import {
    Play,
    Square,
    ArrowLeft,
    Layers,
    Bot,
    Edit,
    Save
} from "lucide-react";


// Generates connection and weight matrices for database representation
const generateMatrices = (nodesList, edgesList) => {
    const N = nodesList.length;
    const connections = Array(N).fill(null).map(() => Array(N).fill("X"));
    const weights = Array(N).fill(null).map(() => Array(N).fill(0.0));

    // Map node.id to index
    const nodeIndexMap = {};
    nodesList.forEach((node, idx) => {
        nodeIndexMap[node.id] = idx;
    });

    edgesList.forEach(edge => {
        const fromIdx = nodeIndexMap[edge.from];
        const toIdx = nodeIndexMap[edge.to];
        if (fromIdx !== undefined && toIdx !== undefined) {
            const fromNode = nodesList[fromIdx];
            const toNode = nodesList[toIdx];

            // Determine types: L, U, or I
            const tFrom = fromNode.type[0].toUpperCase();
            const tTo = toNode.type[0].toUpperCase();
            connections[fromIdx][toIdx] = `${tFrom}${tTo}`;

            // Calculate weight = distance / speed
            const distance = edge.distance || 10.0;
            const speed = edge.speedMultiplier || 1.0;
            weights[fromIdx][toIdx] = parseFloat((distance / speed).toFixed(2));
        }
    });

    return { connections, weights };
};

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
                const neighborNode = nodes.find(n => n.id === neighbor);
                // Robots can only move through intersection nodes.
                if (neighbor === end || (neighborNode && neighborNode.type === "intersection")) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);


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
    const [robotRoutes, setRobotRoutes] = useState([]);
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
                const count = parsed.vehicleCount || data.noOfRobots || 3;
                setVehicleCount(count);

                const loadingNodes = (parsed.nodes || []).filter(n => n.type === "loading");
                const unloadingNodes = (parsed.nodes || []).filter(n => n.type === "unloading");
                
                let existingRobots = parsed.robots || [];
                const updatedRobots = [];
                for (let i = 0; i < count; i++) {
                    const existing = existingRobots.find(r => r.id === i);
                    if (existing) {
                        updatedRobots.push(existing);
                    } else {
                        updatedRobots.push({
                            id: i,
                            startNodeId: loadingNodes[i % loadingNodes.length]?.id || "",
                            endNodeId: unloadingNodes[i % unloadingNodes.length]?.id || ""
                        });
                    }
                }
                setRobotRoutes(updatedRobots);
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
                const route = robotRoutes.find(r => r.id === i) || {};
                const startNode = nodes.find(n => n.id === route.startNodeId) || loadingNodes[i % loadingNodes.length];
                const endNode = nodes.find(n => n.id === route.endNodeId) || unloadingNodes[0];

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
                alert("No connected paths found from start to end nodes for the configured robots!");
                return;
            }

            setVehicles(newVehicles);
            setIsSimulating(true);
        }
    };

    // Simulation animation loop
    useEffect(() => {
        if (!isSimulating) return;

        let reachedEnd = false;

        const updateVehicles = () => {
            setVehicles(prevVehicles => {
                const updated = prevVehicles.map(veh => {
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
                        reachedEnd = true;
                        // Clamp position to the unloading destination node
                        const endNode = nodes.find(n => n.id === path[path.length - 1]);
                        return {
                            ...veh,
                            currentStep: path.length - 1,
                            progress: 0,
                            x: endNode ? endNode.x : veh.x,
                            y: endNode ? endNode.y : veh.y
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
                return updated;
            });

            if (reachedEnd) {
                setIsSimulating(false);
                return; // Stop animation loop
            }

            animationFrameRef.current = requestAnimationFrame(updateVehicles);
        };

        animationFrameRef.current = requestAnimationFrame(updateVehicles);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isSimulating, nodes, edges]);


    const handleRouteChange = (id, field, value) => {
        setRobotRoutes(prev => prev.map(r => {
            if (r.id === id) {
                return { ...r, [field]: value };
            }
            return r;
        }));
    };

    const saveRobotRoutesToDb = async () => {
        try {
            const { connections, weights } = generateMatrices(nodes, edges);
            const response = await fetch(`http://localhost:8080/api/plots/${encodeURIComponent(plotKey)}/graph`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    connections: JSON.stringify(connections),
                    weights: JSON.stringify(weights),
                    canvasData: JSON.stringify({
                        nodes,
                        edges,
                        vehicleCount,
                        robots: robotRoutes
                    })
                })
            });

            if (!response.ok) {
                throw new Error("Server rejected save request.");
            }
            alert("Robot routes saved successfully to the database!");
        } catch (err) {
            alert(`Error saving robot routes: ${err.message}`);
        }
    };

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
            <div style={{
                ...styles.leftPanel,
                width: isSidebarOpen ? "30%" : "0%",
                minWidth: isSidebarOpen ? "340px" : "0px",
                padding: isSidebarOpen ? "40px 30px" : "0px",
                overflowX: "hidden",
                overflowY: "auto",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                gap: "24px",
                borderRight: isSidebarOpen ? "1px solid rgba(255, 255, 255, 0.05)" : "none",
                opacity: isSidebarOpen ? 1 : 0,
                pointerEvents: isSidebarOpen ? "auto" : "none",
                height: "100%"
            }}>
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

                {/* Robot Configuration Section */}
                <div style={{
                    marginTop: "12px",
                    padding: "20px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    flexShrink: 0
                }}>
                    <h3 style={{ fontSize: "15px", fontWeight: "600", color: "#10B981", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                        <Bot size={15} />
                        Robot Routing Setup
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {robotRoutes.map((route, idx) => (
                            <div key={route.id} style={{
                                background: "rgba(255, 255, 255, 0.01)",
                                border: "1px solid rgba(255, 255, 255, 0.03)",
                                borderRadius: "12px",
                                padding: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px"
                            }}>
                                <span style={{ fontSize: "12px", fontWeight: "600", color: "#FFFFFF" }}>Robot {idx + 1}</span>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                                        <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Start (Loading)</span>
                                        <select
                                            value={route.startNodeId}
                                            onChange={(e) => handleRouteChange(route.id, "startNodeId", e.target.value)}
                                            style={{
                                                background: "#070707",
                                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                                borderRadius: "8px",
                                                padding: "6px",
                                                color: "#FFFFFF",
                                                fontSize: "12px",
                                                outline: "none",
                                                width: "100%"
                                            }}
                                        >
                                            {nodes.filter(n => n.type === "loading").map(n => (
                                                <option key={n.id} value={n.id}>{n.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                                        <span style={{ fontSize: "10px", color: "#9CA3AF" }}>End (Unloading)</span>
                                        <select
                                            value={route.endNodeId}
                                            onChange={(e) => handleRouteChange(route.id, "endNodeId", e.target.value)}
                                            style={{
                                                background: "#070707",
                                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                                borderRadius: "8px",
                                                padding: "6px",
                                                color: "#FFFFFF",
                                                fontSize: "12px",
                                                outline: "none",
                                                width: "100%"
                                            }}
                                        >
                                            {nodes.filter(n => n.type === "unloading").map(n => (
                                                <option key={n.id} value={n.id}>{n.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <button
                        onClick={saveRobotRoutesToDb}
                        disabled={isSimulating}
                        style={{
                            background: isSimulating ? "rgba(255, 255, 255, 0.02)" : "rgba(16, 185, 129, 0.1)",
                            border: isSimulating ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid rgba(16, 185, 129, 0.3)",
                            color: isSimulating ? "#4B5563" : "#10B981",
                            borderRadius: "12px",
                            padding: "10px",
                            fontSize: "13px",
                            fontWeight: "600",
                            cursor: isSimulating ? "not-allowed" : "pointer",
                            textAlign: "center",
                            marginTop: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px"
                        }}
                    >
                        <Save size={14} />
                        Save Robot Routes
                    </button>
                </div>

            </div>

            {/* Right Panel */}
            <div style={styles.rightPanel}>
                <div style={styles.headerRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            style={{
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                color: "#9CA3AF",
                                padding: "8px",
                                borderRadius: "8px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease"
                            }}
                            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                        >
                            {isSidebarOpen ? <Layers size={16} style={{ color: "#10B981" }} /> : <Layers size={16} />}
                        </button>
                        <div style={styles.headerInfo}>
                            <h2 style={styles.headerTitle}>Live Simulation Canvas</h2>
                            <span style={styles.headerSubtitle}>
                                {isSimulating ? "Simulation running: AGVs navigating via shortest path" : "Simulation stopped. Click Simulate to start."}
                            </span>
                        </div>
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
