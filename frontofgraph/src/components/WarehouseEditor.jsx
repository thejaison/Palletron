import React, { useState, useEffect, useRef } from "react";
import styles from "../styles/CreatePathStyles";
import { useNavigate, useLocation } from "react-router-dom";
import {
    Plus,
    Link2,
    Trash2,
    MousePointer,
    RefreshCw,
    ArrowRight,
    ArrowLeft,
    Layers,
    Sparkles,
    HelpCircle,
    Bot,
    Save,
    Check
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

            // Populate from -> to direction
            connections[fromIdx][toIdx] = `${tFrom}${tTo}`;
            const distance = edge.distance || 10.0;
            weights[fromIdx][toIdx] = parseFloat(distance.toFixed(2));

            // Populate to -> from direction (bidirectional)
            connections[toIdx][fromIdx] = `${tTo}${tFrom}`;
            weights[toIdx][fromIdx] = parseFloat(distance.toFixed(2));
        }
    });

    return { connections, weights };
};

// Generates initial grid nodes and paths dynamically based on fleet configurations
const generateInitialGraph = (numL, numU, enableIntersection) => {
    const newNodes = [];
    const newEdges = [];

    // 1. Generate Loading Nodes
    for (let i = 0; i < numL; i++) {
        const y = 80 + (i + 1) * (340 / (numL + 1));
        newNodes.push({
            id: `l-${i}`,
            label: `L${i + 1}`,
            x: 180,
            y: Math.round(y / 10) * 10,
            type: "loading"
        });
    }

    // 2. Generate Unloading Nodes
    for (let i = 0; i < numU; i++) {
        const y = 80 + (i + 1) * (340 / (numU + 1));
        newNodes.push({
            id: `u-${i}`,
            label: `U${i + 1}`,
            x: 580,
            y: Math.round(y / 10) * 10,
            type: "unloading"
        });
    }

    // 3. Generate Intersections
    const numI = enableIntersection ? Math.max(2, Math.min(4, Math.floor((numL + numU) / 2))) : 0;
    for (let i = 0; i < numI; i++) {
        const y = 80 + (i + 1) * (340 / (numI + 1));
        newNodes.push({
            id: `i-${i}`,
            label: `I${i + 1}`,
            x: 380,
            y: Math.round(y / 10) * 10,
            type: "intersection"
        });
    }

    // 4. Create Edges
    if (enableIntersection && numI > 0) {
        // Connect loaders to intersections
        for (let i = 0; i < numL; i++) {
            const destIdx = i % numI;
            newEdges.push({
                id: `e-l-${i}`,
                from: `l-${i}`,
                to: `i-${destIdx}`,
                speedMultiplier: 1.0,
                distance: 1000
            });
        }
        // Connect intersections to each other to create crossover pathways
        for (let i = 0; i < numI - 1; i++) {
            newEdges.push({
                id: `e-i-cross-${i}`,
                from: `i-${i}`,
                to: `i-${i + 1}`,
                speedMultiplier: 1.0,
                distance: 1000
            });
            newEdges.push({
                id: `e-i-cross-rev-${i}`,
                from: `i-${i + 1}`,
                to: `i-${i}`,
                speedMultiplier: 1.0,
                distance: 1000
            });
        }
        // Connect intersections to unloaders
        for (let i = 0; i < numI; i++) {
            const destIdx = i % numU;
            newEdges.push({
                id: `e-i-${i}`,
                from: `i-${i}`,
                to: `u-${destIdx}`,
                speedMultiplier: 1.0,
                distance: 1000
            });
        }
    } else {
        // Direct connections from loader to unloader
        for (let i = 0; i < numL; i++) {
            const destIdx = i % numU;
            newEdges.push({
                id: `e-direct-${i}`,
                from: `l-${i}`,
                to: `u-${destIdx}`,
                speedMultiplier: 1.0,
                distance: 1000
            });
        }
    }

    return { nodes: newNodes, edges: newEdges };
};

export default function WarehouseEditor() {
    const navigate = useNavigate();
    const location = useLocation();
    const svgRef = useRef(null);

    // Key and Session States
    const [plotKey, setPlotKey] = useState(localStorage.getItem("palletron_plot_key") || "");
    const [authError, setAuthError] = useState("");
    const [saveStatus, setSaveStatus] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);


    // Graph States
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);

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

    const [vehicleCount, setVehicleCount] = useState(3);
    const [robotRoutes, setRobotRoutes] = useState([]);


    // Redirect to root if no key
    useEffect(() => {
        if (!plotKey) {
            navigate("/");
        } else {
            fetchPlotData(plotKey);
        }
    }, [plotKey, navigate]);

    // Hook: check for configuration redirection parameters from /configure
    useEffect(() => {
        if (location.state && location.state.regenerate && plotKey) {
            const { loadingPoints, unloadingPoints, intersection, vehicles } = location.state;
            const { nodes: initNodes, edges: initEdges } = generateInitialGraph(
                loadingPoints,
                unloadingPoints,
                intersection === "Yes"
            );
            setNodes(initNodes);
            setEdges(initEdges);
            setVehicleCount(vehicles || 3);

            // Persist the generated graph to the database immediately
            saveGraphToDatabase(plotKey, initNodes, initEdges, vehicles || 3);

            // Clean the navigation state history
            navigate(location.pathname, { replace: true });
        }
    }, [location.state, plotKey, navigate]);

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

            // Load coordinates if we have canvasData, otherwise generate a fresh parameter layout
            if (data.canvasData) {
                const parsed = JSON.parse(data.canvasData);
                setNodes(parsed.nodes || []);
                setEdges(parsed.edges || []);
                setVehicleCount(parsed.vehicleCount || data.noOfRobots || 3);
                setRobotRoutes(parsed.robots || []);
            } else {
                const { nodes: initNodes, edges: initEdges } = generateInitialGraph(
                    data.loadingPoints,
                    data.unloadingPoints,
                    data.intersection === "Yes"
                );
                setNodes(initNodes);
                setEdges(initEdges);
                setVehicleCount(data.noOfRobots || 3);
                setRobotRoutes([]);
            }
        } catch (err) {
            setAuthError(err.message);
        }
    };


    // Save full graph representations to the database
    const saveGraphToDatabase = async (key, currentNodes, currentEdges, currentVehicleCount) => {
        try {
            setSaveStatus("Saving...");
            const { connections, weights } = generateMatrices(currentNodes, currentEdges);

            // Self-heal robot routes in case any referenced loading/unloading points were deleted
            const loadingNodes = currentNodes.filter(n => n.type === "loading");
            const unloadingNodes = currentNodes.filter(n => n.type === "unloading");
            const updatedRobots = robotRoutes.map(route => {
                const hasStart = currentNodes.some(n => n.id === route.startNodeId && n.type === "loading");
                const hasEnd = currentNodes.some(n => n.id === route.endNodeId && n.type === "unloading");
                return {
                    ...route,
                    startNodeId: hasStart ? route.startNodeId : (loadingNodes[0]?.id || ""),
                    endNodeId: hasEnd ? route.endNodeId : (unloadingNodes[0]?.id || "")
                };
            });

            const response = await fetch(`http://localhost:8080/api/plots/${encodeURIComponent(key)}/graph`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    connections: JSON.stringify(connections),
                    weights: JSON.stringify(weights),
                    canvasData: JSON.stringify({
                        nodes: currentNodes,
                        edges: currentEdges,
                        vehicleCount: currentVehicleCount,
                        robots: updatedRobots
                    })
                })
            });

            if (!response.ok) {
                throw new Error("Server rejected save request.");
            }
            setSaveStatus("Saved!");
            setTimeout(() => setSaveStatus(""), 3000);
        } catch (err) {
            setSaveStatus(`Save Error: ${err.message}`);
            setTimeout(() => setSaveStatus(""), 5000);
        }
    };


    const handleDone = async () => {
        await saveGraphToDatabase(plotKey, nodes, edges, vehicleCount);
        navigate("/simulation");
    };

    const handleLogout = () => {
        localStorage.removeItem("palletron_plot_key");
        setPlotKey("");
        navigate("/");
    };

    const resetCanvas = () => {
        setNodes([]);
        setEdges([]);
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
        // Prevent click if we dragged/panned more than 5px
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) return;

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
        e.stopPropagation();

        if (mode === "delete") {
            setNodes(nodes.filter(n => n.id !== node.id));
            setEdges(edges.filter(edge => edge.from !== node.id && edge.to !== node.id));
            if (selectedNodeId === node.id) setSelectedNodeId(null);
        } else if (mode === "connect") {
            if (!connectingStartId) {
                setConnectingStartId(node.id);
            } else {
                if (connectingStartId !== node.id) {
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
                            distance: 1000
                        }]);
                    }
                }
                setConnectingStartId(null);
            }
        } else {
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
            setEdges(edges.filter(item => item.id !== edge.id));
            if (selectedEdgeId === edge.id) setSelectedEdgeId(null);
        } else {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
            setConnectingStartId(null);
        }
    };

    const handleUpdateEdgeProp = (edgeId, key, value) => {
        setEdges(prevEdges => prevEdges.map(edge => {
            if (edge.id === edgeId) {
                return { ...edge, [key]: value };
            }
            return edge;
        }));
    };

    const handleCanvasMouseMove = (e) => {
        if (isPanning) {
            setPanOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y
            });
            return;
        }

        if (draggingNodeId) {
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

    const handleCanvasMouseUp = () => {
        setDraggingNodeId(null);
        setIsPanning(false);
    };

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
                        Graph Builder
                    </h1>
                    <p style={styles.subtitle}>
                        Design vertices, connect conveyor paths, and define fleet constraint networks.
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

                    <div style={styles.activeStep}>
                        <div style={styles.stepNumber}>2</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Create Nodes</span>
                            <span style={styles.stepDesc}>Place loaders, unloaders & intersections</span>
                        </div>
                    </div>

                    <div style={styles.step} onClick={handleDone}>
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
                            {isSidebarOpen ? <Layers size={16} style={{ color: "#3B82F6" }} /> : <Layers size={16} />}
                        </button>
                        <div style={styles.headerInfo}>
                            <h2 style={styles.headerTitle}>Interactive Plotting Canvas</h2>
                            <span style={styles.headerSubtitle}>
                                Drag nodes to place. Select tool options below to draw paths.
                            </span>
                        </div>
                    </div>


                    {/* Toolbar */}
                    <div style={styles.toolbar}>
                        <button
                            style={mode === "select" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("select"); setConnectingStartId(null); }}
                        >
                            <MousePointer size={14} />
                            Select / Move
                        </button>

                        <button
                            style={mode === "add" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("add"); setConnectingStartId(null); }}
                        >
                            <Plus size={14} />
                            Add Node
                        </button>

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
                        >
                            <Link2 size={14} />
                            Connect
                        </button>

                        <button
                            style={mode === "delete" ? styles.activeToolButton : styles.toolButton}
                            onClick={() => { setMode("delete"); setConnectingStartId(null); }}
                        >
                            <Trash2 size={14} />
                            Delete
                        </button>

                        <div style={styles.toolDivider} />

                        <button
                            style={styles.toolButton}
                            onClick={resetCanvas}
                        >
                            <RefreshCw size={14} />
                            Reset
                        </button>

                        <div style={styles.toolDivider} />

                        <button
                            onClick={() => saveGraphToDatabase(plotKey, nodes, edges, vehicleCount)}
                            style={{
                                ...styles.toolButton,
                                background: "rgba(59, 130, 246, 0.1)",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                color: "#3B82F6",
                                fontWeight: "bold"
                            }}
                        >
                            <Save size={14} />
                            {saveStatus ? saveStatus : "Save Plot"}
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
                            />
                        </div>

                        <button
                            onClick={handleDone}
                            style={styles.primaryButton}
                        >
                            Done & Simulate
                            <ArrowRight size={14} />
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

                        <rect id="canvas-bg" width="100%" height="100%" fill="url(#grid)" />

                        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
                            {edges.map(edge => {
                                const fromNode = nodes.find(n => n.id === edge.from);
                                const toNode = nodes.find(n => n.id === edge.to);
                                if (!fromNode || !toNode) return null;

                                const isSelected = selectedEdgeId === edge.id;

                                return (
                                    <g key={edge.id}>
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

                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke={isSelected ? "#3B82F6" : "rgba(255, 255, 255, 0.08)"}
                                            strokeWidth="3.5"
                                            strokeLinecap="round"
                                        />

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

                                        {(() => {
                                            const midX = (fromNode.x + toNode.x) / 2;
                                            const midY = (fromNode.y + toNode.y) / 2;
                                            const dist = edge.distance || 10.0;

                                            return (
                                                <g
                                                    transform={`translate(${midX}, ${midY})`}
                                                    style={{ pointerEvents: "none", userSelect: "none" }}
                                                >
                                                    <rect
                                                        x="-24"
                                                        y="-8"
                                                        width="48"
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
                                                        <tspan fill={isSelected ? "#3B82F6" : "#3B82F6"}>{dist.toFixed(0)}cm</tspan>
                                                    </text>
                                                </g>
                                            );
                                        })()}
                                    </g>
                                );
                            })}

                            {nodes.map(node => {
                                const rgbColor = getNodeColor(node.type);
                                const isSelected = selectedNodeId === node.id;
                                const isConnectingStart = connectingStartId === node.id;

                                return (
                                    <g
                                        key={node.id}
                                        transform={`translate(${node.x}, ${node.y})`}
                                        onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                        style={{ cursor: "grab" }}
                                    >
                                        {(isSelected || isConnectingStart) && (
                                            <circle
                                                r="26"
                                                fill="none"
                                                stroke={isConnectingStart ? "#3B82F6" : `rgb(${rgbColor})`}
                                                strokeWidth="2"
                                                strokeDasharray="4 4"
                                            />
                                        )}

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
                        </g>
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

                                    <div style={{ ...styles.inspectorRow, marginTop: "8px" }}>
                                        <span style={styles.inspectorLabel}>Path Distance</span>
                                        <span style={{ ...styles.inspectorValue, color: "#3B82F6" }}>
                                            {selectedEdge.distance || 1000} cm
                                        </span>
                                    </div>
                                    <div style={styles.inspectorControl}>
                                        <input
                                            type="range"
                                            min="100"
                                            max="5000"
                                            step="50"
                                            value={selectedEdge.distance || 1000}
                                            onChange={(e) => handleUpdateEdgeProp(selectedEdge.id, "distance", parseInt(e.target.value))}
                                            style={styles.inspectorSliderDistance}
                                        />
                                        <div style={styles.sliderLabels}>
                                            <span>100cm</span>
                                            <span>1000cm (Default)</span>
                                            <span>5000cm</span>
                                        </div>
                                    </div>
                                    <div style={styles.presetButtons}>
                                        {[500, 1000, 2000, 4000].map(val => (
                                            <button
                                                key={val}
                                                style={styles.presetBtn}
                                                onClick={() => handleUpdateEdgeProp(selectedEdge.id, "distance", val)}
                                            >
                                                {val}cm
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        style={styles.inspectorDeleteBtn}
                                        onClick={() => {
                                            setEdges(edges.filter(e => e.id !== selectedEdge.id));
                                            setSelectedEdgeId(null);
                                        }}
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
}