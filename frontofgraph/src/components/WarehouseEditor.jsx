import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "../styles/WarehouseEditorStyles";
import { 
  Play, 
  Square, 
  ArrowLeft, 
  Save, 
  Settings, 
  Plus, 
  Edit, 
  Check, 
  FileText,
  Navigation,
  Activity,
  Maximize2
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

export default function WarehouseEditor() {
    const location = useLocation();
    const navigate = useNavigate();
    const svgRef = useRef(null);

    // Initial Configuration from state (from WarehouseCreation)
    const initialConfig = location.state || {
        loadingPoints: "3",
        unloadingPoints: "2",
        intersection: "Yes",
        vehicles: "3"
    };

    // States for configuration values
    const [loadingCount, setLoadingCount] = useState(parseInt(initialConfig.loadingPoints) || 3);
    const [unloadingCount, setUnloadingCount] = useState(parseInt(initialConfig.unloadingPoints) || 2);
    const [useIntersection, setUseIntersection] = useState(initialConfig.intersection === "Yes");
    const [fleetSize, setFleetSize] = useState(parseInt(initialConfig.vehicles) || 3);

    // Sidebar Edit Toggle States
    const [editLoading, setEditLoading] = useState(false);
    const [editUnloading, setEditUnloading] = useState(false);
    const [editIntersection, setEditIntersection] = useState(false);
    const [editFleet, setEditFleet] = useState(false);

    // Input States
    const [inputL, setInputL] = useState(loadingCount.toString());
    const [inputU, setInputU] = useState(unloadingCount.toString());
    const [inputI, setInputI] = useState(useIntersection ? "Yes" : "No");
    const [inputF, setInputF] = useState(fleetSize.toString());

    // Graph States
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Simulation States
    const [isSimulating, setIsSimulating] = useState(false);
    const [vehicles, setVehicles] = useState([]);
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

    // Generator function for graph nodes and edges
    const regenerateGraph = (numL, numU, enableIntersection) => {
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
                    to: `i-${destIdx}`
                });
            }
            // Connect intersections to each other to create crossover pathways
            for (let i = 0; i < numI - 1; i++) {
                newEdges.push({
                    id: `e-i-cross-${i}`,
                    from: `i-${i}`,
                    to: `i-${i+1}`
                });
                newEdges.push({
                    id: `e-i-cross-rev-${i}`,
                    from: `i-${i+1}`,
                    to: `i-${i}`
                });
            }
            // Connect intersections to unloaders
            for (let i = 0; i < numI; i++) {
                const destIdx = i % numU;
                newEdges.push({
                    id: `e-i-${i}`,
                    from: `i-${i}`,
                    to: `u-${destIdx}`
                });
            }
        } else {
            // Direct connections from loader to unloader
            for (let i = 0; i < numL; i++) {
                const destIdx = i % numU;
                newEdges.push({
                    id: `e-direct-${i}`,
                    from: `l-${i}`,
                    to: `u-${destIdx}`
                });
            }
        }

        setNodes(newNodes);
        setEdges(newEdges);
        // Reset simulation if parameters change
        setIsSimulating(false);
        setVehicles([]);
    };

    // Run graph generator once initially
    useEffect(() => {
        regenerateGraph(loadingCount, unloadingCount, useIntersection);
    }, [loadingCount, unloadingCount, useIntersection]);

    // SVG coordinate helper
    const getSVGCoordinates = (e) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    // Handle node dragging
    const handleNodeMouseDown = (e, node) => {
        if (isSimulating) return;
        e.stopPropagation();
        setDraggingNodeId(node.id);
        const { x, y } = getSVGCoordinates(e);
        setDragOffset({
            x: x - node.x,
            y: y - node.y
        });
    };

    const handleCanvasMouseMove = (e) => {
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

    const handleCanvasMouseUp = () => {
        setDraggingNodeId(null);
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
                alert("Cannot run simulation without loaders/unloaders.");
                return;
            }

            const newVehicles = [];
            // Spawn N vehicles matching fleetSize
            for (let i = 0; i < fleetSize; i++) {
                const startNode = loadingNodes[i % loadingNodes.length];
                const endNode = unloadingNodes[Math.floor(Math.random() * unloadingNodes.length)];
                const path = findPath(startNode.id, endNode.id, nodes, edges);
                
                if (path) {
                    newVehicles.push({
                        id: `v-fleet-${i}-${Date.now()}`,
                        path,
                        currentStep: 0,
                        progress: 0,
                        speed: 0.01 + Math.random() * 0.008,
                        color: `hsl(${180 + i * 35}, 90%, 55%)`,
                        x: startNode.x,
                        y: startNode.y
                    });
                }
            }

            if (newVehicles.length === 0) {
                alert("Ensure paths connect load nodes to unload nodes!");
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
                    progress += speed;
                    
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

    // Handle parameters updates from sidebar edits
    const saveLoading = () => {
        const val = Math.max(1, Math.min(8, parseInt(inputL) || 3));
        setLoadingCount(val);
        setInputL(val.toString());
        setEditLoading(false);
    };

    const saveUnloading = () => {
        const val = Math.max(1, Math.min(8, parseInt(inputU) || 2));
        setUnloadingCount(val);
        setInputU(val.toString());
        setEditUnloading(false);
    };

    const saveIntersection = () => {
        const val = inputI === "Yes";
        setUseIntersection(val);
        setEditIntersection(false);
    };

    const saveFleet = () => {
        const val = Math.max(1, Math.min(6, parseInt(inputF) || 3));
        setFleetSize(val);
        setInputF(val.toString());
        setEditFleet(false);
    };

    // Export graph summary
    const exportConfig = () => {
        const summary = {
            loaders: loadingCount,
            unloaders: unloadingCount,
            intersections: useIntersection ? "Yes" : "No",
            vehicles: fleetSize,
            totalNodes: nodes.length,
            totalEdges: edges.length
        };
        alert(`Configuration Exported!\n\n${JSON.stringify(summary, null, 2)}`);
    };

    return (
        <div style={styles.page}>
            {/* Canvas Container */}
            <div style={styles.canvasContainer}>
                {/* Header */}
                <div style={styles.canvasHeader}>
                    <div style={styles.canvasTitleInfo}>
                        <h2 style={styles.canvasTitle}>Fleet Simulation Workspace</h2>
                        <span style={styles.canvasSubtitle}>
                            {isSimulating ? "SIMULATION ACTIVE: Running dynamic logisitic routing loops" : "Edit positions or select items on the sidebar."}
                        </span>
                    </div>

                    <div style={styles.canvasControls}>
                        <button 
                            onClick={toggleSimulation}
                            style={{
                                ...styles.btnPrimary,
                                background: isSimulating ? "#EF4444" : "#10B981",
                                color: "#FFFFFF",
                                boxShadow: isSimulating ? "0 4px 12px rgba(239, 68, 68, 0.2)" : "0 4px 12px rgba(16, 185, 129, 0.2)",
                                padding: "8px 16px",
                                borderRadius: "10px",
                                fontSize: "13px"
                            }}
                        >
                            {isSimulating ? <Square size={13} fill="#FFFFFF" /> : <Play size={13} fill="#FFFFFF" />}
                            {isSimulating ? "Stop Simulation" : "Start Simulation"}
                        </button>
                    </div>
                </div>

                {/* SVG Area */}
                <div style={styles.svgWrapper}>
                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                    >
                        <defs>
                            {/* Grid Pattern */}
                            <pattern id="editor-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                            </pattern>

                            {/* Arrow Marker */}
                            <marker 
                                id="arrow-blue" 
                                viewBox="0 0 10 10" 
                                refX="22" 
                                refY="5" 
                                markerWidth="5" 
                                markerHeight="5" 
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(255,255,255,0.2)" />
                            </marker>
                        </defs>

                        {/* Grid Background */}
                        <rect width="100%" height="100%" fill="url(#editor-grid)" />

                        {/* Edges */}
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
                                        markerEnd="url(#arrow-blue)"
                                        strokeLinecap="round"
                                    />
                                </g>
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map(node => {
                            const rgbColor = getNodeColor(node.type);
                            const isDragging = draggingNodeId === node.id;

                            return (
                                <g
                                    key={node.id}
                                    transform={`translate(${node.x}, ${node.y})`}
                                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                    style={{ cursor: isSimulating ? "default" : "grab" }}
                                >
                                    {isDragging && (
                                        <circle 
                                            r="25" 
                                            fill="none" 
                                            stroke={`rgb(${rgbColor})`}
                                            strokeWidth="2" 
                                            strokeDasharray="4 4"
                                        />
                                    )}

                                    <circle
                                        r="18"
                                        fill="#070707"
                                        stroke={`rgba(${rgbColor}, 0.25)`}
                                        strokeWidth="1.5"
                                    />

                                    <circle
                                        r="16"
                                        fill={`rgba(${rgbColor}, 0.08)`}
                                        stroke={`rgba(${rgbColor}, 0.6)`}
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

                        {/* AGV Vehicles */}
                        {isSimulating && vehicles.map(veh => (
                            <g key={veh.id}>
                                <circle
                                    cx={veh.x}
                                    cy={veh.y}
                                    r="10"
                                    fill={veh.color}
                                    opacity="0.25"
                                    style={{ filter: "blur(4px)" }}
                                />
                                <circle
                                    cx={veh.x}
                                    cy={veh.y}
                                    r="6.5"
                                    fill={veh.color}
                                    stroke="#FFFFFF"
                                    strokeWidth="1.5"
                                />
                            </g>
                        ))}
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
                        {useIntersection && (
                            <div style={styles.overlayItem}>
                                <div style={styles.overlayDot("#9CA3AF")} />
                                <span>Intersections</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sidebar Controls */}
            <div style={styles.sidebar}>
                <div>
                    <div style={styles.sidebarHeader}>
                        <h2 style={styles.sidebarTitle}>Workspace Summary</h2>
                        <p style={styles.sidebarSubtitle}>Review parameters or edit configuration values below.</p>
                    </div>

                    <div style={styles.cardsContainer}>
                        {/* Loading Points Card */}
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span style={styles.cardLabel}>Loading Points</span>
                                {!editLoading && (
                                    <button style={styles.editBtn} onClick={() => setEditLoading(true)}>Edit</button>
                                )}
                            </div>
                            {editLoading ? (
                                <div style={styles.cardEditRow}>
                                    <input 
                                        type="number"
                                        min="1"
                                        max="8"
                                        style={styles.cardInput}
                                        value={inputL}
                                        onChange={(e) => setInputL(e.target.value)}
                                    />
                                    <button style={styles.saveBtn} onClick={saveLoading}>
                                        <Check size={11} />
                                    </button>
                                </div>
                            ) : (
                                <strong style={styles.cardValue}>{loadingCount}</strong>
                            )}
                        </div>

                        {/* Unloading Points Card */}
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span style={styles.cardLabel}>Unloading Points</span>
                                {!editUnloading && (
                                    <button style={styles.editBtn} onClick={() => setEditUnloading(true)}>Edit</button>
                                )}
                            </div>
                            {editUnloading ? (
                                <div style={styles.cardEditRow}>
                                    <input 
                                        type="number"
                                        min="1"
                                        max="8"
                                        style={styles.cardInput}
                                        value={inputU}
                                        onChange={(e) => setInputU(e.target.value)}
                                    />
                                    <button style={styles.saveBtn} onClick={saveUnloading}>
                                        <Check size={11} />
                                    </button>
                                </div>
                            ) : (
                                <strong style={styles.cardValue}>{unloadingCount}</strong>
                            )}
                        </div>

                        {/* Intersection Points Card */}
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span style={styles.cardLabel}>Crossover Intersections</span>
                                {!editIntersection && (
                                    <button style={styles.editBtn} onClick={() => setEditIntersection(true)}>Edit</button>
                                )}
                            </div>
                            {editIntersection ? (
                                <div style={styles.cardEditRow}>
                                    <select
                                        style={styles.cardSelect}
                                        value={inputI}
                                        onChange={(e) => setInputI(e.target.value)}
                                    >
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                    <button style={styles.saveBtn} onClick={saveIntersection}>
                                        <Check size={11} />
                                    </button>
                                </div>
                            ) : (
                                <strong style={styles.cardValue}>{useIntersection ? "Enabled" : "Disabled"}</strong>
                            )}
                        </div>

                        {/* Fleet Size Card */}
                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <span style={styles.cardLabel}>Autonomous Vehicles (AGVs)</span>
                                {!editFleet && (
                                    <button style={styles.editBtn} onClick={() => setEditFleet(true)}>Edit</button>
                                )}
                            </div>
                            {editFleet ? (
                                <div style={styles.cardEditRow}>
                                    <input 
                                        type="number"
                                        min="1"
                                        max="6"
                                        style={styles.cardInput}
                                        value={inputF}
                                        onChange={(e) => setInputF(e.target.value)}
                                    />
                                    <button style={styles.saveBtn} onClick={saveFleet}>
                                        <Check size={11} />
                                    </button>
                                </div>
                            ) : (
                                <strong style={styles.cardValue}>{fleetSize}</strong>
                            )}
                        </div>
                    </div>
                </div>

                <div style={styles.footerActions}>
                    <button 
                        style={styles.btnPrimary}
                        onClick={exportConfig}
                    >
                        <FileText size={14} />
                        Export Parameters
                    </button>

                    <button 
                        style={styles.btnSecondary}
                        onClick={() => navigate("/warehouse/create")}
                    >
                        <ArrowLeft size={14} />
                        Back to Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}