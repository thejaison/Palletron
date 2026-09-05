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
    Save,
    Terminal,
    Trash2,
    Sparkles
} from "lucide-react";
import SchematicSimulation from "./SchematicSimulation";


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

// Deduplicate undirected edges to ensure consistency and prevent rendering overlaps
const deduplicateEdges = (edgeList) => {
    const seen = new Map();
    (edgeList || []).forEach(edge => {
        const key = edge.from < edge.to ? `${edge.from}_${edge.to}` : `${edge.to}_${edge.from}`;
        if (!seen.has(key)) {
            seen.set(key, edge);
        } else {
            const existing = seen.get(key);
            if (edge.distance && edge.distance !== 1000) {
                seen.set(key, { ...existing, distance: edge.distance });
            }
        }
    });
    return Array.from(seen.values());
};

// Compass heading helper: East=0°, North=90°, West=180°, South=270°
const getCompassAngle = (uNode, vNode) => {
    if (!uNode || !vNode) return 0;
    const cdx = vNode.x - uNode.x;
    const cdy = uNode.y - vNode.y; // Invert SVG y: Up is North (positive)
    const deg = Math.round(Math.atan2(cdy, cdx) * 180 / Math.PI);
    return (deg + 360) % 360;
};

// Determines edge connection angle taking custom intersection connectionAngles into account
const getSegmentHeading = (fromNode, toNode) => {
    if (!fromNode || !toNode) return 0;
    if (fromNode.type === "intersection" && fromNode.connectionAngles?.[toNode.id] !== undefined) {
        return fromNode.connectionAngles[toNode.id];
    }
    if (toNode.type === "intersection" && toNode.connectionAngles?.[fromNode.id] !== undefined) {
        return (toNode.connectionAngles[fromNode.id] + 180) % 360;
    }
    return getCompassAngle(fromNode, toNode);
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

// Helper to generate simulation and path planning terminal logs
const generateTerminalLogs = (plans, robotRequests, nodes, edges) => {
    const logs = [];

    // 1. Initial planner system logs
    logs.push({
        id: `sys-init-1`,
        time: -0.05,
        type: "system",
        text: `Initializing Multi-Robot Logistics Route Planner...`
    });

    logs.push({
        id: `sys-init-2`,
        time: -0.04,
        type: "system",
        text: `Active Fleet Count: ${robotRequests.length} automated guided vehicles (AGVs) configured.`
    });

    // 2. Compute shortest paths and schedule details for each robot
    plans.forEach((p) => {
        const req = robotRequests.find(r => r.id === p.id) || {};
        const startLabel = nodes.find(n => n.id === req.startNodeId)?.label || req.startNodeId;
        const endLabel = nodes.find(n => n.id === req.endNodeId)?.label || req.endNodeId;
        
        // Calculate path distance
        let pathDist = 0;
        for (let i = 0; i < p.path.length - 1; i++) {
            const u = p.path[i];
            const v = p.path[i+1];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            pathDist += edge?.distance || 10.0;
        }

        const freeRunTime = req.speedCmPerSec > 0 ? pathDist / req.speedCmPerSec : 0;

        logs.push({
            id: `plan-r-${p.id}`,
            time: -0.03,
            type: "planner",
            text: `Robot ${p.id + 1} (${startLabel} ➔ ${endLabel}): Route found! Path = [${p.path.map(nid => nodes.find(n => n.id === nid)?.label || nid).join(" ➔ ")}]. Dist = ${pathDist.toFixed(1)}cm. Speed = ${req.speedCmPerSec}cm/s. Free run time = ${freeRunTime.toFixed(2)}s.`
        });
    });

    logs.push({
        id: `sched-init`,
        time: -0.02,
        type: "system",
        text: `Analyzing temporal conflicts (safety margin = 0.50s)...`
    });

    // 3. Find conflict delays by analyzing wait times
    plans.forEach(p => {
        const req = robotRequests.find(r => r.id === p.id) || {};
        
        for (let k = 1; k < p.scheduleNodes.length; k++) {
            const u = p.scheduleNodes[k-1];
            const v = p.scheduleNodes[k];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            const travelTime = (edge?.distance || 10.0) / (req.speedCmPerSec || 50);
            
            const arrPrev = p.scheduleTimes[k-1];
            const arrNext = p.scheduleTimes[k];
            const waitTime = arrNext - arrPrev - travelTime;

            if (waitTime > 0.01) {
                const nodeLabel = nodes.find(n => n.id === u)?.label || u;
                const nextLabel = nodes.find(n => n.id === v)?.label || v;
                logs.push({
                    id: `delay-r-${p.id}-${k}`,
                    time: -0.01,
                    type: "scheduler",
                    text: `Robot ${p.id + 1}: Traffic conflict resolved at ${nodeLabel}. Delaying departure towards ${nextLabel} by ${waitTime.toFixed(2)}s.`
                });
            }
        }

        const totalTime = p.scheduleTimes[p.scheduleTimes.length - 1];
        let pathDist = 0;
        for (let i = 0; i < p.path.length - 1; i++) {
            const u = p.path[i];
            const v = p.path[i+1];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            pathDist += edge?.distance || 10.0;
        }
        const freeRunTime = req.speedCmPerSec > 0 ? pathDist / req.speedCmPerSec : 0;
        const totalWait = totalTime - freeRunTime;

        if (totalWait > 0.01) {
            logs.push({
                id: `wait-summary-r-${p.id}`,
                time: -0.01,
                type: "scheduler",
                text: `Robot ${p.id + 1}: Final schedule arrival pushed to ${totalTime.toFixed(2)}s (total traffic wait: ${totalWait.toFixed(2)}s).`
            });
        } else {
            logs.push({
                id: `wait-summary-r-${p.id}`,
                time: -0.01,
                type: "scheduler",
                text: `Robot ${p.id + 1}: No traffic conflicts. Scheduled transit time: ${totalTime.toFixed(2)}s.`
            });
        }
    });

    logs.push({
        id: `sys-ready`,
        time: -0.005,
        type: "success",
        text: `Conflict resolution complete. Simulation ready.`
    });

    // 4. Create live simulation logs that appear as time t advances
    plans.forEach(p => {
        const req = robotRequests.find(r => r.id === p.id) || {};
        const startLabel = nodes.find(n => n.id === p.scheduleNodes[0])?.label || p.scheduleNodes[0];
        
        if (p.scheduleTimes[0] > 0.01) {
            logs.push({
                id: `live-start-wait-r-${p.id}`,
                time: 0.0,
                type: "info",
                text: `Robot ${p.id + 1}: Waiting at ${startLabel} for traffic clearance (scheduled departure: ${p.scheduleTimes[0].toFixed(2)}s).`
            });
            logs.push({
                id: `live-depart-r-${p.id}-0`,
                time: p.scheduleTimes[0],
                type: "info",
                text: `Robot ${p.id + 1}: Traffic cleared. Departed ${startLabel} towards ${nodes.find(n => n.id === p.scheduleNodes[1])?.label || p.scheduleNodes[1]}.`
            });
        } else {
            logs.push({
                id: `live-depart-r-${p.id}-0`,
                time: 0.0,
                type: "info",
                text: `Robot ${p.id + 1}: Departed ${startLabel} towards ${nodes.find(n => n.id === p.scheduleNodes[1])?.label || p.scheduleNodes[1]}.`
            });
        }

        // Log intermediate moves and arrivals
        for (let k = 1; k < p.scheduleNodes.length; k++) {
            const u = p.scheduleNodes[k-1];
            const v = p.scheduleNodes[k];
            const nodeLabel = nodes.find(n => n.id === v)?.label || v;
            
            const arrTime = p.scheduleTimes[k];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            const travelTime = (edge?.distance || 10.0) / (req.speedCmPerSec || 50);
            const depTime = arrTime - travelTime;

            if (k > 1) {
                const prevArrTime = p.scheduleTimes[k-1];
                if (depTime > prevArrTime + 0.01) {
                    const uLabel = nodes.find(n => n.id === u)?.label || u;
                    logs.push({
                        id: `live-wait-start-r-${p.id}-${k}`,
                        time: prevArrTime,
                        type: "info",
                        text: `Robot ${p.id + 1}: Arrived at ${uLabel}. Holding position due to traffic occupancy.`
                    });
                    logs.push({
                        id: `live-wait-end-r-${p.id}-${k}`,
                        time: depTime,
                        type: "info",
                        text: `Robot ${p.id + 1}: Cleared to move. Departed ${uLabel} towards ${nodeLabel}.`
                    });
                } else {
                    const uLabel = nodes.find(n => n.id === u)?.label || u;
                    logs.push({
                        id: `live-pass-r-${p.id}-${k}`,
                        time: prevArrTime,
                        type: "info",
                        text: `Robot ${p.id + 1}: Passing through ${uLabel} towards ${nodeLabel}.`
                    });
                }
            }

            if (k === p.scheduleNodes.length - 1) {
                logs.push({
                    id: `live-dest-r-${p.id}`,
                    time: arrTime,
                    type: "success",
                    text: `Robot ${p.id + 1}: Reached destination ${nodeLabel}! Delivery completed in ${arrTime.toFixed(2)}s.`
                });
            }
        }
    });

    logs.sort((a, b) => a.time - b.time);
    return logs;
};


export default function WarehouseSimulation({ defaultTab = "schematic" }) {
    const navigate = useNavigate();
    const svgRef = useRef(null);

    // Tab state: "schematic" | "dark"
    const [activeTab, setActiveTab] = useState(defaultTab);

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

    // Simulation States - decoupled so dark and schematic simulations run independently
    const [activeSimMode, setActiveSimMode] = useState(null); // "schematic" | "dark" | null
    const isSimulatingSchematic = activeSimMode === "schematic";
    const isSimulatingDark = activeSimMode === "dark";
    const isSimulating = activeSimMode !== null;

    const [vehicles, setVehicles] = useState([]);
    const [vehicleCount, setVehicleCount] = useState(3);
    const [robotRoutes, setRobotRoutes] = useState([]);
    const animationFrameRef = useRef(null);
    const maxSimTimeRef = useRef(0);

    // Tab switcher that ensures simulations from different tabs do not bleed into each other
    const handleSwitchTab = (tab) => {
        if (activeSimMode && activeSimMode !== tab) {
            setActiveSimMode(null);
            setVehicles([]);
        }
        setActiveTab(tab);
    };

    // Terminal States
    const [isTerminalOpen, setIsTerminalOpen] = useState(true);
    const [activeLogs, setActiveLogs] = useState([]);
    const terminalLogsRef = useRef([]);
    const terminalEndRef = useRef(null);

    // Auto-scroll terminal to bottom
    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [activeLogs]);

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
                setEdges(deduplicateEdges(parsed.edges || []));
                const count = parsed.vehicleCount || data.noOfRobots || 3;
                setVehicleCount(count);

                const loadingNodes = (parsed.nodes || []).filter(n => n.type === "loading");
                const unloadingNodes = (parsed.nodes || []).filter(n => n.type === "unloading");
                
                let existingRobots = parsed.robots || [];
                const updatedRobots = [];
                for (let i = 0; i < count; i++) {
                    const existing = existingRobots.find(r => r.id === i);
                    if (existing) {
                        updatedRobots.push({
                            ...existing,
                            speedCmPerSec: existing.speedCmPerSec || 50
                        });
                    } else {
                        updatedRobots.push({
                            id: i,
                            startNodeId: loadingNodes[i % loadingNodes.length]?.id || "",
                            endNodeId: unloadingNodes[i % unloadingNodes.length]?.id || "",
                            speedCmPerSec: 50
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


    // Toggle simulation independently per mode ("schematic" (white) or "dark" (black))
    const toggleSimulation = async (targetMode = activeTab) => {
        if (activeSimMode === targetMode) {
            setActiveSimMode(null);
            setVehicles([]);
            setActiveLogs(terminalLogsRef.current.filter(log => log.time < 0));
        } else {
            // Stop any running simulation on the other canvas first
            setActiveSimMode(null);
            setVehicles([]);
            const loadingNodes = nodes.filter(n => n.type === "loading");
            const unloadingNodes = nodes.filter(n => n.type === "unloading");

            if (loadingNodes.length === 0 || unloadingNodes.length === 0) {
                alert("Please ensure you have at least one Loading Point and one Unloading Point to simulate!");
                return;
            }

            const robotRequests = [];
            for (let i = 0; i < vehicleCount; i++) {
                const route = robotRoutes.find(r => r.id === i) || {};
                const startNode = nodes.find(n => n.id === route.startNodeId) || loadingNodes[i % loadingNodes.length];
                const endNode = nodes.find(n => n.id === route.endNodeId) || unloadingNodes[0];

                robotRequests.push({
                    id: i,
                    startNodeId: startNode.id,
                    endNodeId: endNode.id,
                    speedCmPerSec: route.speedCmPerSec || 50
                });
            }

            try {
                // Auto-save the latest graph coordinates and distances to database before planning
                try {
                    const { connections, weights } = generateMatrices(nodes, edges);
                    await fetch(`http://localhost:8080/api/plots/${encodeURIComponent(plotKey)}/graph`, {
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
                } catch (saveErr) {
                    console.warn("Pre-simulation auto-save notice:", saveErr);
                }

                const response = await fetch(`http://localhost:8080/api/plots/${encodeURIComponent(plotKey)}/plan`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(robotRequests)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || "Failed to generate path plan on backend.");
                }

                const plans = await response.json(); // List of RobotResponse
                
                // Verify if any robot has no path found
                const noPathRobot = plans.find(p => !p.path || p.path.length === 0);
                if (noPathRobot) {
                    alert("No connected paths found from start to end nodes for the configured robots!");
                    return;
                }

                const newVehicles = plans.map(p => {
                    const startNode = nodes.find(n => n.id === p.scheduleNodes[0]);
                    return {
                        id: `v-${p.id}-${Date.now()}`,
                        path: p.path,
                        scheduleNodes: p.scheduleNodes,
                        scheduleTimes: p.scheduleTimes,
                        speedCmPerSec: robotRequests.find(r => r.id === p.id)?.speedCmPerSec || 50,
                        color: `hsl(${200 + p.id * 40}, 90%, 60%)`,
                        x: startNode ? startNode.x : 0,
                        y: startNode ? startNode.y : 0
                    };
                });

                maxSimTimeRef.current = Math.max(...newVehicles.map(v => 
                    v.scheduleTimes && v.scheduleTimes.length > 0 
                        ? v.scheduleTimes[v.scheduleTimes.length - 1] 
                        : 0
                ));

                // Generate terminal logs
                const generated = generateTerminalLogs(plans, robotRequests, nodes, edges);
                terminalLogsRef.current = generated;
                setActiveLogs(generated.filter(log => log.time < 0));

                setVehicles(newVehicles);
                setActiveSimMode(targetMode);
            } catch (err) {
                alert(`Error during simulation setup: ${err.message}`);
            }
        }
    };

    // Simulation animation loop
    useEffect(() => {
        if (!activeSimMode || vehicles.length === 0) return;

        const startTime = performance.now();
        const maxSimTime = maxSimTimeRef.current;
        let animationFrame;

        const updateVehicles = () => {
            const now = performance.now();
            const t = (now - startTime) / 1000.0; // elapsed time in seconds
            
            // Update logs
            setActiveLogs(terminalLogsRef.current.filter(log => log.time <= t));

            if (t >= maxSimTime) {
                setActiveSimMode(null);
                setVehicles(prevVehicles => prevVehicles.map(veh => {
                    if (!veh.scheduleNodes || veh.scheduleNodes.length === 0) return veh;
                    const lastNodeId = veh.scheduleNodes[veh.scheduleNodes.length - 1];
                    const endNode = nodes.find(n => n.id === lastNodeId);
                    return {
                        ...veh,
                        x: endNode ? endNode.x : veh.x,
                        y: endNode ? endNode.y : veh.y
                    };
                }));
                // Ensure all logs are shown at the end
                setActiveLogs(terminalLogsRef.current);
                return;
            }

            setVehicles(prevVehicles => {
                const updated = prevVehicles.map(veh => {
                    const { scheduleNodes, scheduleTimes, speedCmPerSec } = veh;
                    if (!scheduleNodes || scheduleNodes.length === 0) return veh;

                    const lastTime = scheduleTimes[scheduleTimes.length - 1];
                    if (t >= lastTime) {
                        const endNode = nodes.find(n => n.id === scheduleNodes[scheduleNodes.length - 1]);
                        return {
                            ...veh,
                            x: endNode ? endNode.x : veh.x,
                            y: endNode ? endNode.y : veh.y
                        };
                    }

                    // Find which segment we are currently in
                    let k = 0;
                    for (let idx = 0; idx < scheduleTimes.length - 1; idx++) {
                        if (t >= scheduleTimes[idx] && t < scheduleTimes[idx + 1]) {
                            k = idx;
                            break;
                        }
                    }

                    const fromNodeId = scheduleNodes[k];
                    const toNodeId = scheduleNodes[k + 1];
                    const fromNode = nodes.find(n => n.id === fromNodeId);
                    const toNode = nodes.find(n => n.id === toNodeId);

                    if (!fromNode || !toNode) return veh;

                    // Look up edge distance
                    const currentEdge = edges.find(e =>
                        (e.from === fromNodeId && e.to === toNodeId) ||
                        (e.from === toNodeId && e.to === fromNodeId)
                    );
                    const distance = currentEdge?.distance || 10.0;
                    const travelTime = distance / speedCmPerSec;
                    const tArrivalFrom = scheduleTimes[k];
                    const tArrivalTo = scheduleTimes[k + 1];
                    let tDepart = tArrivalTo - travelTime;

                    // Bulletproof clamp against skipping or jumping:
                    // If tDepart is earlier than tArrivalFrom (e.g. backend/frontend distance discrepancy),
                    // clamp tDepart to tArrivalFrom so the robot moves continuously between arrival and next arrival
                    if (tDepart < tArrivalFrom) {
                        tDepart = tArrivalFrom;
                    }
                    const effectiveTravelTime = Math.max(0.001, tArrivalTo - tDepart);

                    let x = fromNode.x;
                    let y = fromNode.y;
                    let heading = 0;
                    let turningAngle = 0;
                    let turnStatus = "Straight (0°)";
                    let status = "MOVING";

                    const segHeading = getSegmentHeading(fromNode, toNode);

                    let prevHeading = segHeading;
                    if (k > 0) {
                        const prevNode = nodes.find(n => n.id === scheduleNodes[k - 1]);
                        if (prevNode) {
                            prevHeading = getSegmentHeading(prevNode, fromNode);
                        }
                    }

                    // Shortest angular turn difference in [-180, 180]
                    const angleDiff = ((segHeading - prevHeading + 540) % 360) - 180;

                    if (t >= tDepart) {
                        // Robot is moving smoothly on the segment
                        const progress = Math.max(0, Math.min(1, (t - tDepart) / effectiveTravelTime));
                        x = fromNode.x + (toNode.x - fromNode.x) * progress;
                        y = fromNode.y + (toNode.y - fromNode.y) * progress;

                        if (Math.abs(angleDiff) > 5 && progress < 0.35) {
                            const turnEase = progress / 0.35;
                            heading = Math.round((prevHeading + angleDiff * turnEase + 360) % 360);
                            turningAngle = Math.abs(Math.round(angleDiff));
                            const dir = angleDiff > 0 ? "Counter-Clockwise (Left)" : "Clockwise (Right)";
                            turnStatus = `Turning ${turningAngle}° ${dir}`;
                            status = "TURNING AT INTERSECTION";
                        } else {
                            heading = segHeading;
                            turningAngle = Math.abs(Math.round(angleDiff));
                            turnStatus = Math.abs(angleDiff) > 5 ? `Turn: ${turningAngle}° Completed` : "Straight (0°)";
                            status = "MOVING";
                        }
                    } else {
                        // Robot is waiting at fromNode due to scheduled traffic delay
                        x = fromNode.x;
                        y = fromNode.y;
                        heading = prevHeading;
                        status = "WAITING (TRAFFIC DELAY)";
                        turnStatus = "Holding Position";
                    }

                    return {
                        ...veh,
                        x,
                        y,
                        heading,
                        turningAngle,
                        turnStatus,
                        status,
                        fromNodeLabel: fromNode.label || fromNode.id,
                        toNodeLabel: toNode.label || toNode.id,
                        segmentDistance: distance
                    };
                });
                return updated;
            });

            animationFrame = requestAnimationFrame(updateVehicles);
        };

        animationFrame = requestAnimationFrame(updateVehicles);

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
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

                {/* Simulation Mode Tabs */}
                <div style={{
                    display: "flex",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "4px",
                    gap: "6px"
                }}>
                    <button
                        onClick={() => setActiveTab("schematic")}
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            padding: "8px 6px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            border: "none",
                            background: activeTab === "schematic" ? "#FFFFFF" : "transparent",
                            color: activeTab === "schematic" ? "#111827" : "#9CA3AF",
                            boxShadow: activeTab === "schematic" ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
                            transition: "all 0.2s ease"
                        }}
                    >
                        <Sparkles size={13} style={{ color: activeTab === "schematic" ? "#10B981" : "#9CA3AF" }} />
                        Schematic Grid
                    </button>
                    <button
                        onClick={() => setActiveTab("dark")}
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            padding: "8px 6px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            border: "none",
                            background: activeTab === "dark" ? "#10B981" : "transparent",
                            color: activeTab === "dark" ? "#000000" : "#9CA3AF",
                            transition: "all 0.2s ease"
                        }}
                    >
                        <Layers size={13} />
                        Dark Canvas
                    </button>
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
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                                    <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Robot Speed (cm/sec)</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="500"
                                        value={route.speedCmPerSec || 50}
                                        onChange={(e) => handleRouteChange(route.id, "speedCmPerSec", parseFloat(e.target.value) || 0)}
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
                                    />
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

            {/* Right Panel / Simulation Tabs */}
            {activeTab === "schematic" ? (
                <div style={{ flex: 1, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <SchematicSimulation
                        nodes={nodes}
                        setNodes={setNodes}
                        edges={edges}
                        setEdges={setEdges}
                        vehicles={isSimulatingSchematic ? vehicles : []}
                        isSimulating={isSimulatingSchematic}
                        toggleSimulation={() => toggleSimulation("schematic")}
                        robotRoutes={robotRoutes}
                        handleRouteChange={handleRouteChange}
                        vehicleCount={vehicleCount}
                        plotKey={plotKey}
                        activeLogs={activeLogs}
                        setActiveLogs={setActiveLogs}
                        onSwitchTab={handleSwitchTab}
                        saveRobotRoutesToDb={saveRobotRoutesToDb}
                    />
                </div>
            ) : (
                <>
                    {/* Right Panel (Dark Canvas) */}
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

                    {/* View Mode Tabs in Header */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "3px",
                        gap: "4px"
                    }}>
                        <button
                            onClick={() => handleSwitchTab("schematic")}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "6px 12px",
                                borderRadius: "7px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: "none",
                                background: activeTab === "schematic" ? "#FFFFFF" : "transparent",
                                color: activeTab === "schematic" ? "#111827" : "#9CA3AF",
                                boxShadow: activeTab === "schematic" ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                                transition: "all 0.2s ease"
                            }}
                        >
                            <Sparkles size={13} style={{ color: activeTab === "schematic" ? "#10B981" : "#9CA3AF" }} />
                            Schematic Grid (White)
                        </button>
                        <button
                            onClick={() => handleSwitchTab("dark")}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "6px 12px",
                                borderRadius: "7px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: "none",
                                background: activeTab === "dark" ? "#10B981" : "transparent",
                                color: activeTab === "dark" ? "#000000" : "#9CA3AF",
                                transition: "all 0.2s ease"
                            }}
                        >
                            <Layers size={13} />
                            Dark Canvas (Black)
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div style={styles.toolbar}>
                        <button
                            onClick={() => toggleSimulation("dark")}
                            style={{
                                ...styles.activeToolButton,
                                background: isSimulatingDark ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                                border: isSimulatingDark ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                                color: isSimulatingDark ? "#EF4444" : "#10B981"
                            }}
                        >
                            {isSimulatingDark ? <Square size={14} fill="#EF4444" /> : <Play size={14} fill="#10B981" />}
                            {isSimulatingDark ? "Stop Simulation" : "Start Simulation"}
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

                        <button
                            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                            style={isTerminalOpen ? styles.activeToolButton : styles.toolButton}
                        >
                            <Terminal size={14} />
                            Logs
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

                                        {/* Distance Badge */}
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
                                                        <tspan fill="#3B82F6">{dist.toFixed(0)}cm</tspan>
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

                            {/* Animated Vehicles (AGVs) - Only rendered on Dark Canvas when dark simulation is running */}
                            {isSimulatingDark && vehicles.map(vehicle => (
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

            {/* Terminal Panel */}
            <div style={{
                ...styles.terminalPanel,
                width: isTerminalOpen ? "25%" : "0%",
                minWidth: isTerminalOpen ? "320px" : "0px",
                opacity: isTerminalOpen ? 1 : 0,
                pointerEvents: isTerminalOpen ? "auto" : "none"
            }}>
                <div style={styles.terminalHeader}>
                    <div style={styles.terminalTitle}>
                        <Terminal size={14} />
                        System Logs
                    </div>
                    <div style={styles.terminalControls}>
                        <button
                            onClick={() => setActiveLogs([])}
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "#9CA3AF",
                                cursor: "pointer",
                                padding: "4px"
                            }}
                            title="Clear Logs"
                        >
                            <Trash2 size={14} />
                        </button>
                        <button
                            onClick={() => setIsTerminalOpen(false)}
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "#9CA3AF",
                                cursor: "pointer",
                                padding: "4px"
                            }}
                            title="Close Terminal"
                        >
                            <Square size={14} />
                        </button>
                    </div>
                </div>
                <div style={styles.terminalBody}>
                    {activeLogs.map((log, i) => (
                        <div key={`${log.id}-${i}`} style={styles.logLine}>
                            <span style={styles.logTimestamp}>
                                [{Math.max(0, log.time).toFixed(2)}s]
                            </span>
                            <span style={styles.logTag(log.type)}>
                                [{log.type.toUpperCase()}]
                            </span>
                            <span style={styles.logText(log.type)}>
                                {log.text}
                            </span>
                        </div>
                    ))}
                    <div ref={terminalEndRef} />
                </div>
            </div>
        </>
    )}
</div>
    );
}
