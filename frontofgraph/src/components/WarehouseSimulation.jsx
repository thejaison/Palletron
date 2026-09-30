import React, { useState, useEffect, useRef, useMemo } from "react";
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
    Sparkles,
    Gauge,
    Zap
} from "lucide-react";
import SchematicSimulation from "./SchematicSimulation";

/**
 * Kinematics calculation for trapezoidal/triangular motion:
 * - distance: distance to travel (cm)
 * - targetSpeed: maximum cruise speed (cm/s)
 * - accelTimeSec: time to accelerate from 0 to targetSpeed (s)
 * - decelTimeSec: time to decelerate from targetSpeed to 0 (s)
 * - elapsed: time elapsed since motion began (s)
 *
 * Returns:
 * {
 *   progress: number between 0 and 1,
 *   currentSpeed: instantaneous speed in cm/s,
 *   currentAccel: instantaneous acceleration in cm/s²,
 *   motionPhase: "ACCELERATING" | "CRUISING" | "DECELERATING" | "STOPPED" | "TURNING",
 *   totalTime: total time to traverse distance (s),
 *   peakSpeed: max speed reached (cm/s),
 *   accelRate: acceleration rate (cm/s²),
 *   decelRate: deceleration rate (cm/s²)
 * }
 */
export function calculateKinematics(distance, targetSpeed, accelTimeSec = 1.0, decelTimeSec = 1.0, elapsed = 0) {
    if (distance <= 0 || targetSpeed <= 0) {
        return {
            progress: 1,
            currentSpeed: 0,
            currentAccel: 0,
            motionPhase: "STOPPED",
            totalTime: 0,
            peakSpeed: 0,
            accelRate: 0,
            decelRate: 0
        };
    }

    const ta = Math.max(0.01, Number(accelTimeSec) || 0.01);
    const td = Math.max(0.01, Number(decelTimeSec) || 0.01);
    const a = targetSpeed / ta; // cm/s²
    const d = targetSpeed / td; // cm/s²

    const dCrit = 0.5 * targetSpeed * (ta + td);

    let totalTime;
    let tAcc;
    let tCruise;
    let tDec;
    let peakSpeed;

    if (distance >= dCrit) {
        // Trapezoidal velocity profile
        peakSpeed = targetSpeed;
        tAcc = ta;
        const dCruise = distance - dCrit;
        tCruise = dCruise / targetSpeed;
        tDec = td;
        totalTime = tAcc + tCruise + tDec;
    } else {
        // Triangular velocity profile
        peakSpeed = Math.sqrt((2.0 * distance * targetSpeed) / (ta + td));
        tAcc = ta * (peakSpeed / targetSpeed);
        tCruise = 0;
        tDec = td * (peakSpeed / targetSpeed);
        totalTime = tAcc + tDec;
    }

    const tau = Math.max(0, Math.min(elapsed, totalTime));
    let distCovered = 0;
    let currentSpeed = 0;
    let currentAccel = 0;
    let motionPhase = "STOPPED";

    if (tau <= 0) {
        distCovered = 0;
        currentSpeed = 0;
        currentAccel = a;
        motionPhase = "STOPPED";
    } else if (tau < tAcc) {
        motionPhase = "ACCELERATING";
        currentAccel = a;
        currentSpeed = a * tau;
        distCovered = 0.5 * a * tau * tau;
    } else if (tau < tAcc + tCruise) {
        motionPhase = "CRUISING";
        currentAccel = 0;
        currentSpeed = peakSpeed;
        const distAcc = 0.5 * a * tAcc * tAcc;
        distCovered = distAcc + peakSpeed * (tau - tAcc);
    } else if (tau < totalTime) {
        motionPhase = "DECELERATING";
        currentAccel = -d;
        const remTime = totalTime - tau;
        currentSpeed = d * remTime;
        distCovered = distance - 0.5 * d * remTime * remTime;
    } else {
        motionPhase = "STOPPED";
        currentSpeed = 0;
        currentAccel = 0;
        distCovered = distance;
    }

    const progress = Math.min(1, Math.max(0, distCovered / distance));

    return {
        progress,
        currentSpeed: Math.max(0, currentSpeed),
        currentAccel,
        motionPhase,
        totalTime,
        peakSpeed,
        accelRate: a,
        decelRate: d
    };
}

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
        
        // Calculate path distance and kinematic free-run time
        let pathDist = 0;
        let freeRunTime = 0;
        for (let i = 0; i < p.path.length - 1; i++) {
            const u = p.path[i];
            const v = p.path[i+1];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            const dist = edge?.distance || 10.0;
            pathDist += dist;
            freeRunTime += calculateKinematics(dist, req.speedCmPerSec || 50, req.accelTimeSec || 1.0, req.decelTimeSec || 1.0).totalTime;
        }

        const ta = req.accelTimeSec !== undefined ? req.accelTimeSec : 1.0;
        const td = req.decelTimeSec !== undefined ? req.decelTimeSec : 1.0;
        const aRate = ((req.speedCmPerSec || 50) / ta).toFixed(1);
        const dRate = ((req.speedCmPerSec || 50) / td).toFixed(1);

        logs.push({
            id: `plan-r-${p.id}`,
            time: -0.03,
            type: "planner",
            text: `Robot ${p.id + 1} (${startLabel} ➔ ${endLabel}): Route found! Path = [${p.path.map(nid => nodes.find(n => n.id === nid)?.label || nid).join(" ➔ ")}]. Dist = ${pathDist.toFixed(1)}cm. Target Speed = ${req.speedCmPerSec}cm/s (Accel: ${ta}s [${aRate}cm/s²], Decel: ${td}s [${dRate}cm/s²]). Kinematic free run time = ${freeRunTime.toFixed(2)}s.`
        });
    });

    logs.push({
        id: `sched-init`,
        time: -0.02,
        type: "system",
        text: `Analyzing temporal conflicts & kinematic profiles (safety margin = 0.50s)...`
    });

    // 3. Find conflict delays by analyzing wait times and applying 3/4th Advance Equation
    plans.forEach(p => {
        const req = robotRequests.find(r => r.id === p.id) || {};
        
        for (let k = 1; k < p.scheduleNodes.length; k++) {
            const u = p.scheduleNodes[k-1];
            const v = p.scheduleNodes[k];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            const dist = edge?.distance || 10.0;
            const kin = calculateKinematics(dist, req.speedCmPerSec || 50, req.accelTimeSec || 1.0, req.decelTimeSec || 1.0);
            const travelTime = kin.totalTime;
            
            const arrPrev = p.scheduleTimes[k-1];
            const arrNext = p.scheduleTimes[k];
            const waitTime = arrNext - arrPrev - travelTime;

            if (waitTime > 0.01) {
                const nodeLabel = nodes.find(n => n.id === u)?.label || u;
                const nextLabel = nodes.find(n => n.id === v)?.label || v;
                const safety = req.safetyDistanceCm !== undefined ? req.safetyDistanceCm : 50;

                logs.push({
                    id: `delay-r-${p.id}-${k}`,
                    time: -0.01,
                    type: "scheduler",
                    text: `Robot ${p.id + 1}: Traffic conflict detected approaching ${nextLabel}. Advancing 3/4th distance (${(dist * 0.75).toFixed(1)}cm) from ${nodeLabel} and holding at 3/4th standoff buffer while edge ahead is occupied (${safety}cm vehicle buffer enforced).`
                });
            }
        }

        const totalTime = p.scheduleTimes[p.scheduleTimes.length - 1];
        let pathDist = 0;
        let freeRunTime = 0;
        for (let i = 0; i < p.path.length - 1; i++) {
            const u = p.path[i];
            const v = p.path[i+1];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            const dist = edge?.distance || 10.0;
            pathDist += dist;
            freeRunTime += calculateKinematics(dist, req.speedCmPerSec || 50, req.accelTimeSec || 1.0, req.decelTimeSec || 1.0).totalTime;
        }
        const totalWait = totalTime - freeRunTime;
        const safety = req.safetyDistanceCm !== undefined ? req.safetyDistanceCm : 50;

        if (totalWait > 0.01) {
            logs.push({
                id: `wait-summary-r-${p.id}`,
                time: -0.01,
                type: "scheduler",
                text: `Robot ${p.id + 1}: Final arrival scheduled at ${totalTime.toFixed(2)}s (holding at 3/4th standoff buffers; ${safety}cm safety buffer strictly enforced).`
            });
        } else {
            logs.push({
                id: `wait-summary-r-${p.id}`,
                time: -0.01,
                type: "scheduler",
                text: `Robot ${p.id + 1}: Direct transit path. Scheduled transit time: ${totalTime.toFixed(2)}s.`
            });
        }
    });

    logs.push({
        id: `sys-ready`,
        time: -0.005,
        type: "success",
        text: `Conflict resolution complete. Edge occupancy exclusivity, 3/4th standoff buffers & safety distance enforced. Simulation ready.`
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
                text: `Robot ${p.id + 1}: Staged at ${startLabel} (scheduled departure: ${p.scheduleTimes[0].toFixed(2)}s).`
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
            const uLabel = nodes.find(n => n.id === u)?.label || u;
            
            const arrTime = p.scheduleTimes[k];
            const prevArrTime = p.scheduleTimes[k-1];
            const edge = edges.find(e => (e.from === u && e.to === v) || (e.from === v && e.to === u));
            const dist = edge?.distance || 10.0;
            const kinSeg = calculateKinematics(dist, req.speedCmPerSec || 50, req.accelTimeSec || 1.0, req.decelTimeSec || 1.0, 0);
            const travelTime = kinSeg.totalTime;
            const depTime = arrTime - travelTime;

            // Check if turning at node u
            let hasTurn = false;
            let turnAngle = 0;
            let turnDir = "";
            let turnDuration = 0;

            if (k > 1) {
                const prevNode = nodes.find(n => n.id === p.scheduleNodes[k-2]);
                const currNode = nodes.find(n => n.id === u);
                const nextNode = nodes.find(n => n.id === v);

                if (prevNode && currNode && nextNode) {
                    const prevH = getSegmentHeading(prevNode, currNode);
                    const segH = getSegmentHeading(currNode, nextNode);
                    const turnDiff = ((segH - prevH + 540) % 360) - 180;
                    if (Math.abs(turnDiff) > 5) {
                        hasTurn = true;
                        turnAngle = Math.abs(Math.round(turnDiff));
                        turnDir = turnDiff > 0 ? "Left" : "Right";
                        const maxT = travelTime * 0.40;
                        const desT = 0.6 + (turnAngle / 180) * 1.2;
                        turnDuration = Math.min(desT, maxT);
                    }
                }
            }

            const waitDelay = arrTime - prevArrTime - (turnDuration + travelTime);
            if (waitDelay > 0.05) {
                const tTurnEnd = prevArrTime + turnDuration;
                const advanceDist = dist * 0.75;
                const remDist = dist * 0.25;
                const kin75 = calculateKinematics(advanceDist, req.speedCmPerSec || 50, req.accelTimeSec || 1.0, req.decelTimeSec || 1.0, 0);
                const kin25 = calculateKinematics(remDist, req.speedCmPerSec || 50, req.accelTimeSec || 1.0, req.decelTimeSec || 1.0, 0);
                const t34TravelTime = kin75.totalTime;
                const remTravelTime = kin25.totalTime;
                const tStandoffArrival = tTurnEnd + t34TravelTime;
                const tFinalDepart = Math.max(tStandoffArrival, arrTime - remTravelTime);
                const safety = req.safetyDistanceCm !== undefined ? req.safetyDistanceCm : 50;

                if (hasTurn) {
                    logs.push({
                        id: `live-turn-r-${p.id}-${k}`,
                        time: prevArrTime,
                        type: "info",
                        text: `Robot ${p.id + 1}: Steering tires ${turnAngle}° ${turnDir} at ${uLabel} before 3/4 advance.`
                    });
                }
                logs.push({
                    id: `live-adv-r-${p.id}-${k}`,
                    time: tTurnEnd,
                    type: "info",
                    text: `Robot ${p.id + 1}: Advancing 3/4th distance (${advanceDist.toFixed(1)}cm) towards ${nodeLabel}.`
                });
                logs.push({
                    id: `live-hold-r-${p.id}-${k}`,
                    time: tStandoffArrival,
                    type: "warning",
                    text: `Robot ${p.id + 1}: Holding at 3/4th standoff point (${(dist * 0.25).toFixed(1)}cm buffer) - Edge connecting ${nodeLabel} occupied (${safety}cm vehicle buffer).`
                });
                logs.push({
                    id: `live-clear-r-${p.id}-${k}`,
                    time: tFinalDepart,
                    type: "success",
                    text: `Robot ${p.id + 1}: Connecting edge cleared. Resuming from 3/4th standoff for final approach into ${nodeLabel}.`
                });
            } else {
                if (hasTurn) {
                    logs.push({
                        id: `live-turn-r-${p.id}-${k}`,
                        time: prevArrTime,
                        type: "info",
                        text: `Robot ${p.id + 1}: Reached ${uLabel}. Steering tires ${turnAngle}° ${turnDir} at node.`
                    });
                    logs.push({
                        id: `live-pass-r-${p.id}-${k}`,
                        time: prevArrTime + turnDuration,
                        type: "info",
                        text: `Robot ${p.id + 1}: Tires aligned. Departed ${uLabel} towards ${nodeLabel}.`
                    });
                } else if (k > 1) {
                    logs.push({
                        id: `live-pass-r-${p.id}-${k}`,
                        time: prevArrTime,
                        type: "info",
                        text: `Robot ${p.id + 1}: Passing through ${uLabel} towards ${nodeLabel}.`
                    });
                }
            }

            logs.push({
                id: `live-arr-r-${p.id}-${k}`,
                time: arrTime,
                type: "success",
                text: `Robot ${p.id + 1}: Arrived at ${nodeLabel}.`
            });

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
    const lastFrameTimeRef = useRef(null);

    // Compute currently occupied edges and their connecting terminal nodes
    const { occupiedNodesMap, occupiedEdgeSet } = useMemo(() => {
        const nodeMap = new Map();
        const edgeSet = new Set();

        vehicles.forEach(v => {
            if (!v || v.status === "DESTINATION REACHED" || v.status === "IDLE" || !v.fromNodeId || !v.toNodeId) {
                return;
            }
            // A vehicle actively occupies an edge if it is traversing (moving, turning, cruising, 3/4 standoff, or safety buffer)
            const isTraversing = v.motionPhase !== "STOPPED" || 
                                 v.status?.includes("STANDOFF") || 
                                 v.status?.includes("MOVING") || 
                                 v.status?.includes("TURNING") || 
                                 v.status?.includes("APPROACH") ||
                                 v.status?.includes("SAFETY");

            if (isTraversing) {
                const pair1 = `${v.fromNodeId}_${v.toNodeId}`;
                const pair2 = `${v.toNodeId}_${v.fromNodeId}`;
                edgeSet.add(pair1);
                edgeSet.add(pair2);

                if (!nodeMap.has(v.fromNodeId)) nodeMap.set(v.fromNodeId, []);
                nodeMap.get(v.fromNodeId).push(v);

                if (!nodeMap.has(v.toNodeId)) nodeMap.set(v.toNodeId, []);
                nodeMap.get(v.toNodeId).push(v);
            }
        });

        return { occupiedNodesMap: nodeMap, occupiedEdgeSet: edgeSet };
    }, [vehicles]);

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
                            speedCmPerSec: existing.speedCmPerSec || 50,
                            accelTimeSec: existing.accelTimeSec !== undefined ? Number(existing.accelTimeSec) : 1.0,
                            decelTimeSec: existing.decelTimeSec !== undefined ? Number(existing.decelTimeSec) : 1.0,
                            safetyDistanceCm: existing.safetyDistanceCm !== undefined ? Number(existing.safetyDistanceCm) : 50.0
                        });
                    } else {
                        updatedRobots.push({
                            id: i,
                            startNodeId: loadingNodes[i % loadingNodes.length]?.id || "",
                            endNodeId: unloadingNodes[i % unloadingNodes.length]?.id || "",
                            speedCmPerSec: 50,
                            accelTimeSec: 1.0,
                            decelTimeSec: 1.0,
                            safetyDistanceCm: 50.0
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
                    speedCmPerSec: route.speedCmPerSec || 50,
                    accelTimeSec: route.accelTimeSec !== undefined ? Number(route.accelTimeSec) : 1.0,
                    decelTimeSec: route.decelTimeSec !== undefined ? Number(route.decelTimeSec) : 1.0,
                    safetyDistanceCm: route.safetyDistanceCm !== undefined ? Number(route.safetyDistanceCm) : 50.0
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
                    const req = robotRequests.find(r => r.id === p.id) || {};
                    const startNode = nodes.find(n => n.id === p.scheduleNodes[0]);
                    return {
                        id: `v-${p.id}-${Date.now()}`,
                        robotId: p.id,
                        path: p.path,
                        scheduleNodes: p.scheduleNodes,
                        scheduleTimes: p.scheduleTimes,
                        speedCmPerSec: req.speedCmPerSec || 50,
                        accelTimeSec: req.accelTimeSec !== undefined ? req.accelTimeSec : 1.0,
                        decelTimeSec: req.decelTimeSec !== undefined ? req.decelTimeSec : 1.0,
                        safetyDistanceCm: p.safetyDistanceCm || req.safetyDistanceCm || 50.0,
                        currentSpeed: 0,
                        currentAccel: 0,
                        motionPhase: "STOPPED",
                        color: `hsl(${200 + p.id * 40}, 90%, 60%)`,
                        x: startNode ? startNode.x : 0,
                        y: startNode ? startNode.y : 0,
                        delayAccumSec: 0,
                        fromNodeId: p.scheduleNodes[0],
                        toNodeId: p.scheduleNodes.length > 1 ? p.scheduleNodes[1] : p.scheduleNodes[0],
                        fromNodeLabel: startNode?.label || p.scheduleNodes[0],
                        toNodeLabel: p.scheduleNodes.length > 1 ? (nodes.find(n => n.id === p.scheduleNodes[1])?.label || p.scheduleNodes[1]) : "",
                        status: "WAITING AT START NODE",
                        turnStatus: `Staged at ${startNode?.label || p.scheduleNodes[0]}`
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
        lastFrameTimeRef.current = performance.now();
        let animationFrame;

        const updateVehicles = () => {
            const now = performance.now();
            const prevTime = lastFrameTimeRef.current || now;
            const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000.0));
            lastFrameTimeRef.current = now;
            const globalElapsed = (now - startTime) / 1000.0;

            // Update terminal logs
            setActiveLogs(terminalLogsRef.current.filter(log => log.time <= globalElapsed));

            setVehicles(prevVehicles => {
                // Calculate average canvas scale in cm per pixel
                let totalDistCm = 0;
                let totalPx = 0;
                edges.forEach(e => {
                    const n1 = nodes.find(n => n.id === e.from);
                    const n2 = nodes.find(n => n.id === e.to);
                    if (n1 && n2 && e.distance) {
                        const px = Math.hypot(n2.x - n1.x, n2.y - n1.y);
                        if (px > 1) {
                            totalDistCm += e.distance;
                            totalPx += px;
                        }
                    }
                });
                const defaultScale = totalPx > 0 ? (totalDistCm / totalPx) : 0.5;

                // Check if all vehicles have reached final destination
                const allFinished = prevVehicles.every(veh => veh.status === "DESTINATION REACHED");
                if (allFinished) {
                    setActiveSimMode(null);
                    setActiveLogs(terminalLogsRef.current);
                    return prevVehicles;
                }

                return prevVehicles.map((veh, i) => {
                    if (veh.status === "DESTINATION REACHED") {
                        return {
                            ...veh,
                            currentSpeed: 0,
                            currentAccel: 0,
                            motionPhase: "STOPPED",
                            turnStatus: "Parked at Destination"
                        };
                    }

                    const { scheduleNodes, scheduleTimes, speedCmPerSec = 50, accelTimeSec = 1.0, decelTimeSec = 1.0, safetyDistanceCm = 50.0 } = veh;
                    if (!scheduleNodes || scheduleNodes.length === 0) return veh;

                    const delay = veh.delayAccumSec || 0;
                    const t = Math.max(0, globalElapsed - delay);
                    const safetyDist = veh.safetyDistanceCm !== undefined ? Number(veh.safetyDistanceCm) : 50.0;

                    // If robot hasn't reached scheduled departure at start node, check staging
                    if (scheduleTimes.length > 0 && t < scheduleTimes[0]) {
                        const startNode = nodes.find(n => n.id === scheduleNodes[0]);
                        let blockedAtStart = false;
                        let blkInfo = null;

                        for (let j = 0; j < prevVehicles.length; j++) {
                            if (j === i) continue;
                            const other = prevVehicles[j];
                            const sDist = Math.hypot(other.x - (startNode ? startNode.x : veh.x), other.y - (startNode ? startNode.y : veh.y)) * defaultScale;
                            const otherSafety = other.safetyDistanceCm !== undefined ? Number(other.safetyDistanceCm) : 50.0;
                            const requiredBuffer = Math.max(safetyDist, otherSafety);
                            if (sDist <= requiredBuffer) {
                                blockedAtStart = true;
                                blkInfo = { id: other.robotId, dist: sDist, req: requiredBuffer };
                                break;
                            }
                        }

                        if (blockedAtStart) {
                            return {
                                ...veh,
                                x: startNode ? startNode.x : veh.x,
                                y: startNode ? startNode.y : veh.y,
                                delayAccumSec: delay + dt,
                                status: `STOPPED (${Math.round(blkInfo.req)}CM SAFETY DISTANCE)`,
                                turnStatus: `Safety Stop: Robot ${blkInfo.id + 1} within ${Math.round(blkInfo.req)}cm (${blkInfo.dist.toFixed(1)}cm)`,
                                currentSpeed: 0,
                                currentAccel: 0,
                                motionPhase: "STOPPED"
                            };
                        }

                        return {
                            ...veh,
                            x: startNode ? startNode.x : veh.x,
                            y: startNode ? startNode.y : veh.y,
                            status: "WAITING AT START NODE",
                            turnStatus: `Staged at ${startNode?.label || scheduleNodes[0]} (Departs at ${scheduleTimes[0].toFixed(2)}s)`,
                            currentSpeed: 0,
                            currentAccel: 0,
                            motionPhase: "STOPPED",
                            fromNodeId: scheduleNodes[0],
                            toNodeId: scheduleNodes.length > 1 ? scheduleNodes[1] : scheduleNodes[0],
                            fromNodeLabel: startNode?.label || scheduleNodes[0],
                            toNodeLabel: scheduleNodes.length > 1 ? (nodes.find(n => n.id === scheduleNodes[1])?.label || scheduleNodes[1]) : "",
                            segmentDistance: 0
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

                    const finalTime = scheduleTimes[scheduleTimes.length - 1];
                    if (t >= finalTime) {
                        const endNode = nodes.find(n => n.id === scheduleNodes[scheduleNodes.length - 1]);
                        return {
                            ...veh,
                            x: endNode ? endNode.x : veh.x,
                            y: endNode ? endNode.y : veh.y,
                            status: "DESTINATION REACHED",
                            turnStatus: "Parked at Destination",
                            currentSpeed: 0,
                            currentAccel: 0,
                            motionPhase: "STOPPED"
                        };
                    }

                    const fromNodeId = scheduleNodes[k];
                    const toNodeId = scheduleNodes[k + 1];
                    const fromNode = nodes.find(n => n.id === fromNodeId);
                    const toNode = nodes.find(n => n.id === toNodeId);

                    if (!fromNode || !toNode) {
                        return veh;
                    }

                    // Look up edge distance and kinematic transit time
                    const currentEdge = edges.find(e =>
                        (e.from === fromNodeId && e.to === toNodeId) ||
                        (e.from === toNodeId && e.to === fromNodeId)
                    );
                    const distance = currentEdge?.distance || 10.0;
                    const edgePxLen = Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y) || 1;
                    const scaleCmPerPx = distance / edgePxLen;

                    // Forward unit vector along edge
                    const fwdX = (toNode.x - fromNode.x) / edgePxLen;
                    const fwdY = (toNode.y - fromNode.y) / edgePxLen;

                    const kinSeg = calculateKinematics(distance, speedCmPerSec, accelTimeSec, decelTimeSec, 0);
                    const travelTime = kinSeg.totalTime;
                    const tArrivalFrom = scheduleTimes[k];
                    const tArrivalTo = scheduleTimes[k + 1];

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
                    const hasTurn = Math.abs(angleDiff) > 5;
                    const maxTurnTime = travelTime * 0.40;
                    const desiredTurnTime = 0.6 + (Math.abs(angleDiff) / 180) * 1.2;
                    const turnDuration = hasTurn ? Math.min(desiredTurnTime, maxTurnTime) : 0;
                    const dir = angleDiff > 0 ? "Counter-Clockwise (Left)" : "Clockwise (Right)";

                    const fixedTurnDuration = hasTurn ? Math.min(desiredTurnTime, 0.8) : 0;
                    const tTurnEnd = tArrivalFrom + fixedTurnDuration;
                    const minStepTime = fixedTurnDuration + travelTime;

                    // 3/4th Advance Kinematics:
                    const kin75 = calculateKinematics(0.75 * distance, speedCmPerSec, accelTimeSec, decelTimeSec, 0);
                    const t34TravelTime = kin75.totalTime;
                    const tStandoffArrival = tTurnEnd + t34TravelTime;

                    const kin25 = calculateKinematics(0.25 * distance, speedCmPerSec, accelTimeSec, decelTimeSec, 0);
                    const tFinalTravelTime = kin25.totalTime;
                    const tFinalDepart = Math.max(tStandoffArrival, tArrivalTo - tFinalTravelTime);

                    // Departure time if continuous without standoff:
                    const tDepart = Math.max(tTurnEnd, tArrivalTo - travelTime);

                    const vehSafetyDist = veh.safetyDistanceCm !== undefined ? veh.safetyDistanceCm : 50.0;

                    // =========================================================
                    // 1. HARD PROXIMITY CHECK (CONFIGURABLE SAFETY DISTANCE) WITH PRIORITY RESOLUTION
                    // =========================================================
                    let isBlockedSafetyDist = false;
                    let blockDetails = null;

                    for (let j = 0; j < prevVehicles.length; j++) {
                        if (j === i) continue;
                        const other = prevVehicles[j];
                        const otherSafetyDist = other.safetyDistanceCm !== undefined ? other.safetyDistanceCm : 50.0;
                        const requiredBuffer = Math.max(vehSafetyDist, otherSafetyDist);

                        const dx = other.x - veh.x;
                        const dy = other.y - veh.y;
                        const pxDist = Math.hypot(dx, dy);
                        const distCm = pxDist * scaleCmPerPx;

                        if (distCm <= requiredBuffer) {
                            const distForwardCm = (dx * fwdX + dy * fwdY) * scaleCmPerPx;
                            const distLateralCm = Math.abs(dx * (-fwdY) + dy * fwdX) * scaleCmPerPx;

                            // A vehicle NEVER stops for a vehicle that is behind it!
                            if (distForwardCm < -2.0) {
                                continue;
                            }

                            // If other vehicle is parked at its final destination in front:
                            if (other.status === "DESTINATION REACHED" && distForwardCm > 0) {
                                isBlockedSafetyDist = true;
                                blockDetails = { id: other.robotId, distCm, requiredBuffer, label: `Parked Robot R${other.robotId + 1}` };
                                break;
                            }

                            // PRIORITY RESOLUTION:
                            // Priority order: R1 (robotId 0) > R2 (robotId 1) > R3 (robotId 2)...
                            const otherHasHigherPriority = other.robotId < veh.robotId;
                            const vehHasHigherPriority = veh.robotId < other.robotId;

                            if (otherHasHigherPriority) {
                                isBlockedSafetyDist = true;
                                blockDetails = { id: other.robotId, distCm, requiredBuffer, label: `Priority Robot R${other.robotId + 1}` };
                                break;
                            } else if (vehHasHigherPriority) {
                                // veh has higher priority, does not stop
                            } else {
                                if (distForwardCm > 0.5 && distLateralCm < requiredBuffer * 0.8) {
                                    isBlockedSafetyDist = true;
                                    blockDetails = { id: other.robotId, distCm, requiredBuffer, label: `Robot R${other.robotId + 1}` };
                                    break;
                                }
                            }
                        }
                    }

                    if (isBlockedSafetyDist) {
                        return {
                            ...veh,
                            x: veh.x,
                            y: veh.y,
                            delayAccumSec: delay + dt,
                            currentSpeed: 0,
                            currentAccel: 0,
                            motionPhase: "STOPPED",
                            status: `STOPPED (${Math.round(blockDetails.requiredBuffer)}CM SAFETY DISTANCE)`,
                            turnStatus: `Yielding to ${blockDetails.label} (${blockDetails.distCm.toFixed(1)}cm) - Keeping ${Math.round(blockDetails.requiredBuffer)}cm buffer`
                        };
                    }

                    // =========================================================
                    // 2. CHECK IF CURRENT EDGE (fromNode -> toNode) IS OCCUPIED
                    // =========================================================
                    const distFromFromNode = Math.hypot(veh.x - fromNode.x, veh.y - fromNode.y) * scaleCmPerPx;
                    const isAtOriginNode = distFromFromNode < 12.0 || t < tDepart;

                    let isCurrentEdgeOccupied = false;
                    let currentEdgeBlocker = "";

                    for (let j = 0; j < prevVehicles.length; j++) {
                        if (j === i) continue;
                        const other = prevVehicles[j];
                        if (other.status === "DESTINATION REACHED") {
                            if (other.scheduleNodes && other.scheduleNodes[other.scheduleNodes.length - 1] === toNodeId) {
                                isCurrentEdgeOccupied = true;
                                currentEdgeBlocker = `Parked Robot R${other.robotId + 1}`;
                                break;
                            }
                            continue;
                        }

                        const oFrom = other.fromNodeId;
                        const oTo = other.toNodeId;
                        const onSameEdge = (oFrom === fromNodeId && oTo === toNodeId) || (oFrom === toNodeId && oTo === fromNodeId);
                        if (onSameEdge && other.status !== "DESTINATION REACHED") {
                            const distOtherFromOrigin = Math.hypot(other.x - fromNode.x, other.y - fromNode.y) * scaleCmPerPx;
                            if (distOtherFromOrigin > 15.0) {
                                isCurrentEdgeOccupied = true;
                                currentEdgeBlocker = `Robot R${other.robotId + 1}`;
                                break;
                            }
                            if (other.robotId < veh.robotId) {
                                isCurrentEdgeOccupied = true;
                                currentEdgeBlocker = `Priority Robot R${other.robotId + 1}`;
                                break;
                            }
                        }
                    }

                    if (isCurrentEdgeOccupied && isAtOriginNode) {
                        return {
                            ...veh,
                            x: fromNode.x,
                            y: fromNode.y,
                            delayAccumSec: delay + dt,
                            currentSpeed: 0,
                            currentAccel: 0,
                            motionPhase: "STOPPED",
                            status: "WAITING AT NODE (EDGE OCCUPIED)",
                            turnStatus: `Holding at Node - Edge Occupied by ${currentEdgeBlocker}`
                        };
                    }

                    // =========================================================
                    // 3. CHECK IF DESTINATION NODE / CONNECTING EDGE IS OCCUPIED (3/4TH STANDOFF TRIGGER)
                    // =========================================================
                    let isToNodeOccupiedAhead = false;
                    let toNodeOccupiedInfo = "";

                    for (let j = 0; j < prevVehicles.length; j++) {
                        if (j === i) continue;
                        const other = prevVehicles[j];
                        if (other.status === "DESTINATION REACHED") continue;

                        // Check if other is occupying an edge connected to toNode
                        const connectsToNode = (other.fromNodeId === toNodeId || other.toNodeId === toNodeId);
                        if (connectsToNode) {
                            const otherIsTraversing = other.motionPhase !== "STOPPED" || 
                                                      other.status?.includes("STANDOFF") || 
                                                      other.status?.includes("MOVING") || 
                                                      other.status?.includes("TURNING") || 
                                                      other.status?.includes("APPROACH");
                            
                            const distOtherToNode = Math.hypot(other.x - toNode.x, other.y - toNode.y) * scaleCmPerPx;
                            const otherSafety = other.safetyDistanceCm || 50.0;

                            if (otherIsTraversing || distOtherToNode <= otherSafety + 25.0) {
                                isToNodeOccupiedAhead = true;
                                toNodeOccupiedInfo = `Robot R${other.robotId + 1}`;
                                break;
                            }
                        }
                    }

                    const hasScheduledHold = (tArrivalTo - tArrivalFrom) >= (minStepTime + 0.1) && tFinalDepart >= tStandoffArrival;
                    const shouldAdvance34 = (hasScheduledHold || isToNodeOccupiedAhead) && !isCurrentEdgeOccupied;

                    // =========================================================
                    // 4. MOTION EXECUTION: 3/4TH STANDOFF ADVANCE VS STANDARD
                    // =========================================================
                    let heading = segHeading;
                    let turningAngle = 0;
                    let x = fromNode.x;
                    let y = fromNode.y;
                    let currentSpeed = 0;
                    let currentAccel = 0;
                    let motionPhase = "STOPPED";
                    let status = "MOVING";
                    let turnStatus = "Straight (0°)";

                    if (shouldAdvance34) {
                        // 3/4th Advance Standoff Sequence
                        // Phase 1: Turn at fromNode before advance
                        if (hasTurn && t < tTurnEnd) {
                            x = fromNode.x;
                            y = fromNode.y;
                            const turnProgress = Math.min(1, Math.max(0, (t - tArrivalFrom) / Math.max(0.001, fixedTurnDuration)));
                            const turnEase = 0.5 - 0.5 * Math.cos(turnProgress * Math.PI);
                            heading = Math.round((prevHeading + angleDiff * turnEase + 360) % 360);
                            turningAngle = Math.abs(Math.round(angleDiff * (1 - turnProgress)));
                            status = fromNode.type === "intersection" ? "TURNING AT INTERSECTION" : "TURNING AT NODE";
                            turnStatus = `Steering ${Math.abs(Math.round(angleDiff))}° ${dir} Before 3/4 Advance`;
                            currentSpeed = 0;
                            currentAccel = 0;
                            motionPhase = "TURNING";
                        }
                        // Phase 2: Actively moving 3/4th (75%) distance towards toNode
                        else if (t < tStandoffArrival) {
                            const advanceElapsed = Math.max(0, t - tTurnEnd);
                            const kin34 = calculateKinematics(0.75 * distance, speedCmPerSec, accelTimeSec, decelTimeSec, advanceElapsed);
                            const advanceProgress = Math.min(1, Math.max(0, kin34.progress));
                            const progress = 0.75 * advanceProgress;

                            const candidateX = fromNode.x + (toNode.x - fromNode.x) * progress;
                            const candidateY = fromNode.y + (toNode.y - fromNode.y) * progress;

                            // Candidate proximity check
                            let candidateBlocked = false;
                            let candidateInfo = null;
                            for (let j = 0; j < prevVehicles.length; j++) {
                                if (j === i) continue;
                                const other = prevVehicles[j];
                                const otherSafetyDist = other.safetyDistanceCm || 50.0;
                                const reqBuf = Math.max(vehSafetyDist, otherSafetyDist);
                                const cdx = other.x - candidateX;
                                const cdy = other.y - candidateY;
                                const cdist = Math.hypot(cdx, cdy) * scaleCmPerPx;
                                if (cdist <= reqBuf) {
                                    const fwdDist = (cdx * fwdX + cdy * fwdY) * scaleCmPerPx;
                                    if (fwdDist < -2.0) continue;
                                    if (other.status === "DESTINATION REACHED" && fwdDist > 0) {
                                        candidateBlocked = true;
                                        candidateInfo = { id: other.robotId, distCm: cdist, reqBuf, label: `Parked Robot R${other.robotId + 1}` };
                                        break;
                                    }
                                    if (other.robotId < veh.robotId) {
                                        candidateBlocked = true;
                                        candidateInfo = { id: other.robotId, distCm: cdist, reqBuf, label: `Priority Robot R${other.robotId + 1}` };
                                        break;
                                    }
                                }
                            }

                            if (candidateBlocked) {
                                return {
                                    ...veh,
                                    x: veh.x,
                                    y: veh.y,
                                    delayAccumSec: delay + dt,
                                    currentSpeed: 0,
                                    currentAccel: 0,
                                    motionPhase: "STOPPED",
                                    status: `STOPPED (${Math.round(candidateInfo.reqBuf)}CM SAFETY DISTANCE)`,
                                    turnStatus: `Yielding to ${candidateInfo.label} (${candidateInfo.distCm.toFixed(1)}cm) - Keeping ${Math.round(candidateInfo.reqBuf)}cm buffer`
                                };
                            }

                            x = candidateX;
                            y = candidateY;
                            heading = segHeading;
                            turningAngle = 0;
                            currentSpeed = kin34.currentSpeed;
                            currentAccel = kin34.currentAccel;
                            motionPhase = kin34.motionPhase;
                            status = "MOVING (3/4 ADVANCE)";
                            turnStatus = `Advancing 75% Distance (${(advanceProgress * 75).toFixed(0)}%) to Standoff`;
                        }
                        // Phase 3: Holding at 75% standoff point until edge ahead clears AND scheduled release
                        else if (t < tFinalDepart || isToNodeOccupiedAhead) {
                            x = fromNode.x + (toNode.x - fromNode.x) * 0.75;
                            y = fromNode.y + (toNode.y - fromNode.y) * 0.75;
                            heading = segHeading;
                            turningAngle = 0;
                            currentSpeed = 0;
                            currentAccel = 0;
                            motionPhase = "STOPPED";
                            status = "WAITING AT 3/4 STANDOFF";
                            turnStatus = isToNodeOccupiedAhead
                                ? `Holding 75% Standoff Buffer (${toNodeOccupiedInfo} Occupying ${toNode.label || toNodeId})`
                                : "Holding 75% Standoff Buffer... Edge Ahead Occupied";

                            if (t >= tFinalDepart && isToNodeOccupiedAhead) {
                                return {
                                    ...veh,
                                    x,
                                    y,
                                    delayAccumSec: delay + dt,
                                    heading,
                                    turningAngle,
                                    currentSpeed: 0,
                                    currentAccel: 0,
                                    motionPhase: "STOPPED",
                                    status,
                                    turnStatus,
                                    fromNodeId,
                                    toNodeId,
                                    fromNodeLabel: fromNode.label || fromNode.id,
                                    toNodeLabel: toNode.label || toNode.id,
                                    segmentDistance: distance
                                };
                            }
                        }
                        // Phase 4: Final approach - covering remaining 25% distance into toNode
                        else {
                            const finalElapsed = Math.max(0, t - tFinalDepart);
                            const kin25 = calculateKinematics(0.25 * distance, speedCmPerSec, accelTimeSec, decelTimeSec, finalElapsed);
                            const finalProgress = Math.min(1, Math.max(0, kin25.progress));
                            const progress = 0.75 + 0.25 * finalProgress;

                            const candidateX = fromNode.x + (toNode.x - fromNode.x) * progress;
                            const candidateY = fromNode.y + (toNode.y - fromNode.y) * progress;

                            // Candidate proximity check
                            let candidateBlocked = false;
                            let candidateInfo = null;
                            for (let j = 0; j < prevVehicles.length; j++) {
                                if (j === i) continue;
                                const other = prevVehicles[j];
                                const otherSafetyDist = other.safetyDistanceCm || 50.0;
                                const reqBuf = Math.max(vehSafetyDist, otherSafetyDist);
                                const cdx = other.x - candidateX;
                                const cdy = other.y - candidateY;
                                const cdist = Math.hypot(cdx, cdy) * scaleCmPerPx;
                                if (cdist <= reqBuf) {
                                    const fwdDist = (cdx * fwdX + cdy * fwdY) * scaleCmPerPx;
                                    if (fwdDist < -2.0) continue;
                                    if (other.status === "DESTINATION REACHED" && fwdDist > 0) {
                                        candidateBlocked = true;
                                        candidateInfo = { id: other.robotId, distCm: cdist, reqBuf, label: `Parked Robot R${other.robotId + 1}` };
                                        break;
                                    }
                                    if (other.robotId < veh.robotId) {
                                        candidateBlocked = true;
                                        candidateInfo = { id: other.robotId, distCm: cdist, reqBuf, label: `Priority Robot R${other.robotId + 1}` };
                                        break;
                                    }
                                }
                            }

                            if (candidateBlocked) {
                                return {
                                    ...veh,
                                    x: veh.x,
                                    y: veh.y,
                                    delayAccumSec: delay + dt,
                                    currentSpeed: 0,
                                    currentAccel: 0,
                                    motionPhase: "STOPPED",
                                    status: `STOPPED (${Math.round(candidateInfo.reqBuf)}CM SAFETY DISTANCE)`,
                                    turnStatus: `Yielding to ${candidateInfo.label} (${candidateInfo.distCm.toFixed(1)}cm) - Keeping ${Math.round(candidateInfo.reqBuf)}cm buffer`
                                };
                            }

                            x = candidateX;
                            y = candidateY;
                            heading = segHeading;
                            turningAngle = 0;
                            currentSpeed = kin25.currentSpeed;
                            currentAccel = kin25.currentAccel;
                            motionPhase = kin25.motionPhase;
                            status = "FINAL APPROACH (LAST 25%)";
                            turnStatus = `Entering ${toNode.label || toNodeId} - Final 25% approach`;
                        }
                    } else {
                        // Standard Continuous Motion:
                        if (t < tDepart) {
                            let h = segHeading;
                            let tAngle = 0;
                            if (hasTurn) {
                                const steerDuration = Math.min(turnDuration > 0 ? turnDuration : 0.8, 0.8);
                                const turnProgress = Math.min(1, Math.max(0, (t - tArrivalFrom) / Math.max(0.001, steerDuration)));
                                const turnEase = 0.5 - 0.5 * Math.cos(turnProgress * Math.PI);
                                h = Math.round((prevHeading + angleDiff * turnEase + 360) % 360);
                                tAngle = Math.abs(Math.round(angleDiff * (1 - turnProgress)));
                            }
                            return {
                                ...veh,
                                x: fromNode.x,
                                y: fromNode.y,
                                heading: h,
                                turningAngle: tAngle,
                                currentSpeed: 0,
                                currentAccel: 0,
                                motionPhase: "STOPPED",
                                status: "WAITING AT NODE",
                                turnStatus: `Holding at Node - Scheduled departure at ${tDepart.toFixed(2)}s`,
                                fromNodeId,
                                toNodeId,
                                fromNodeLabel: fromNode.label || fromNode.id,
                                toNodeLabel: toNode.label || toNode.id,
                                segmentDistance: distance
                            };
                        }

                        if (hasTurn && t < tTurnEnd) {
                            x = fromNode.x;
                            y = fromNode.y;
                            const turnProgress = Math.min(1, Math.max(0, (t - tArrivalFrom) / Math.max(0.001, turnDuration)));
                            const turnEase = 0.5 - 0.5 * Math.cos(turnProgress * Math.PI);
                            heading = Math.round((prevHeading + angleDiff * turnEase + 360) % 360);
                            turningAngle = Math.abs(Math.round(angleDiff * (1 - turnProgress)));
                            status = fromNode.type === "intersection" ? "TURNING AT INTERSECTION" : "TURNING AT NODE";
                            turnStatus = `Turning ${Math.abs(Math.round(angleDiff))}° ${dir} (Tires Steering)`;
                            currentSpeed = 0;
                            currentAccel = 0;
                            motionPhase = "TURNING";
                        } else {
                            const moveDuration = Math.max(0.001, tArrivalTo - tDepart);
                            const moveElapsed = Math.max(0, t - tDepart);
                            const effectiveElapsed = Math.min(kinSeg.totalTime, moveElapsed * (kinSeg.totalTime / moveDuration));
                            const kin = calculateKinematics(distance, speedCmPerSec, accelTimeSec, decelTimeSec, effectiveElapsed);
                            const progress = Math.min(1, Math.max(0, kin.progress));

                            const candidateX = fromNode.x + (toNode.x - fromNode.x) * progress;
                            const candidateY = fromNode.y + (toNode.y - fromNode.y) * progress;

                            // Candidate proximity check
                            let candidateBlocked = false;
                            let candidateInfo = null;
                            for (let j = 0; j < prevVehicles.length; j++) {
                                if (j === i) continue;
                                const other = prevVehicles[j];
                                const otherSafetyDist = other.safetyDistanceCm || 50.0;
                                const reqBuf = Math.max(vehSafetyDist, otherSafetyDist);
                                const cdx = other.x - candidateX;
                                const cdy = other.y - candidateY;
                                const cdist = Math.hypot(cdx, cdy) * scaleCmPerPx;
                                if (cdist <= reqBuf) {
                                    const fwdDist = (cdx * fwdX + cdy * fwdY) * scaleCmPerPx;
                                    if (fwdDist < -2.0) continue;
                                    if (other.status === "DESTINATION REACHED" && fwdDist > 0) {
                                        candidateBlocked = true;
                                        candidateInfo = { id: other.robotId, distCm: cdist, reqBuf, label: `Parked Robot R${other.robotId + 1}` };
                                        break;
                                    }
                                    const otherHasPriority = other.robotId < veh.robotId;
                                    if (otherHasPriority) {
                                        candidateBlocked = true;
                                        candidateInfo = { id: other.robotId, distCm: cdist, reqBuf, label: `Priority Robot R${other.robotId + 1}` };
                                        break;
                                    }
                                }
                            }

                            if (candidateBlocked) {
                                return {
                                    ...veh,
                                    x: veh.x,
                                    y: veh.y,
                                    delayAccumSec: delay + dt,
                                    currentSpeed: 0,
                                    currentAccel: 0,
                                    motionPhase: "STOPPED",
                                    status: `STOPPED (${Math.round(candidateInfo.reqBuf)}CM SAFETY DISTANCE)`,
                                    turnStatus: `Yielding to ${candidateInfo.label} (${candidateInfo.distCm.toFixed(1)}cm) - Keeping ${Math.round(candidateInfo.reqBuf)}cm buffer`
                                };
                            }

                            x = candidateX;
                            y = candidateY;
                            heading = segHeading;
                            turningAngle = 0;
                            currentSpeed = kin.currentSpeed * (kinSeg.totalTime / moveDuration);
                            currentAccel = kin.currentAccel;
                            motionPhase = kin.motionPhase;
                            status = "MOVING";
                            turnStatus = kin.motionPhase === "CRUISING"
                                ? `Cruising at ${currentSpeed.toFixed(1)} cm/s`
                                : (kin.motionPhase === "ACCELERATING"
                                    ? `Accelerating (+${kin.currentAccel.toFixed(1)} cm/s²)`
                                    : `Decelerating (${kin.currentAccel.toFixed(1)} cm/s²)`);
                        }
                    }

                    return {
                        ...veh,
                        x,
                        y,
                        heading,
                        turningAngle,
                        turnStatus,
                        status,
                        currentSpeed: Math.round(currentSpeed * 10) / 10,
                        currentAccel: Math.round(currentAccel * 10) / 10,
                        motionPhase,
                        fromNodeId,
                        toNodeId,
                        fromNodeLabel: fromNode.label || fromNode.id,
                        toNodeLabel: toNode.label || toNode.id,
                        segmentDistance: distance
                    };
                });
            });

            animationFrame = requestAnimationFrame(updateVehicles);
        };

        animationFrame = requestAnimationFrame(updateVehicles);

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [activeSimMode, nodes, edges]);


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
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Target Speed (cm/sec)</span>
                                        <span style={{ fontSize: "10px", fontWeight: "700", color: "#10B981" }}>
                                            {route.speedCmPerSec || 50} cm/s
                                        </span>
                                    </div>
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

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Accel Time (s)</span>
                                            <span style={{ fontSize: "9px", color: "#60A5FA", fontWeight: 700 }}>
                                                {((route.speedCmPerSec || 50) / (route.accelTimeSec || 1.0)).toFixed(1)} cm/s²
                                            </span>
                                        </div>
                                        <input
                                            type="number"
                                            min="0.1"
                                            max="30"
                                            step="0.1"
                                            value={route.accelTimeSec !== undefined ? route.accelTimeSec : 1.0}
                                            onChange={(e) => handleRouteChange(route.id, "accelTimeSec", parseFloat(e.target.value) || 0.1)}
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
                                            title="Time in seconds to accelerate from 0 to target speed"
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Decel Time (s)</span>
                                            <span style={{ fontSize: "9px", color: "#F59E0B", fontWeight: 700 }}>
                                                {((route.speedCmPerSec || 50) / (route.decelTimeSec || 1.0)).toFixed(1)} cm/s²
                                            </span>
                                        </div>
                                        <input
                                            type="number"
                                            min="0.1"
                                            max="30"
                                            step="0.1"
                                            value={route.decelTimeSec !== undefined ? route.decelTimeSec : 1.0}
                                            onChange={(e) => handleRouteChange(route.id, "decelTimeSec", parseFloat(e.target.value) || 0.1)}
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
                                            title="Time in seconds to decelerate from target speed to 0"
                                        />
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "10px", color: "#9CA3AF" }}>Keep Distance (cm)</span>
                                        <span style={{ fontSize: "9px", color: "#3B82F6", fontWeight: 700 }}>
                                            {route.safetyDistanceCm !== undefined ? route.safetyDistanceCm : 50} cm
                                        </span>
                                    </div>
                                    <input
                                        type="number"
                                        min="5"
                                        max="500"
                                        step="5"
                                        value={route.safetyDistanceCm !== undefined ? route.safetyDistanceCm : 50}
                                        onChange={(e) => handleRouteChange(route.id, "safetyDistanceCm", parseFloat(e.target.value) || 50)}
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
                                        title="Distance this robot keeps with other robots (cm)"
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

                                const isEdgeOccupied = isSimulating && (occupiedEdgeSet.has(`${edge.from}_${edge.to}`) || occupiedEdgeSet.has(`${edge.to}_${edge.from}`));

                                return (
                                    <g key={edge.id}>
                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke={isEdgeOccupied ? "rgba(239, 68, 68, 0.45)" : "rgba(255, 255, 255, 0.08)"}
                                            strokeWidth={isEdgeOccupied ? "5" : "3.5"}
                                            strokeLinecap="round"
                                        />

                                        <line
                                            x1={fromNode.x}
                                            y1={fromNode.y}
                                            x2={toNode.x}
                                            y2={toNode.y}
                                            stroke={isEdgeOccupied ? "#EF4444" : "rgba(255, 255, 255, 0.15)"}
                                            strokeWidth={isEdgeOccupied ? "2.5" : "1.5"}
                                            markerEnd="url(#arrow)"
                                            strokeLinecap="round"
                                            strokeDasharray={isEdgeOccupied ? "6 4" : "none"}
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
                                                        stroke={isEdgeOccupied ? "#EF4444" : "rgba(255, 255, 255, 0.12)"}
                                                        strokeWidth="1"
                                                    />
                                                    <text
                                                        textAnchor="middle"
                                                        dy=".3em"
                                                        fontSize="9px"
                                                        fontWeight="700"
                                                        fill="#FFFFFF"
                                                    >
                                                        <tspan fill={isEdgeOccupied ? "#F87171" : "#3B82F6"}>{dist.toFixed(0)}cm</tspan>
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
                                const isOccupied = isSimulating && occupiedNodesMap.has(node.id);

                                return (
                                    <g
                                        key={node.id}
                                        transform={`translate(${node.x}, ${node.y})`}
                                    >
                                        {/* Occupied Pulse Animation Ring */}
                                        {isOccupied && (
                                            <circle
                                                r="28"
                                                fill="none"
                                                stroke="#EF4444"
                                                strokeWidth="2.5"
                                                strokeDasharray="4 3"
                                                opacity="0.9"
                                            />
                                        )}

                                        <circle
                                            r="20"
                                            fill={isOccupied ? "rgba(239, 68, 68, 0.25)" : "#070707"}
                                            stroke={isOccupied ? "#EF4444" : `rgba(${rgbColor}, 0.25)`}
                                            strokeWidth={isOccupied ? "2.5" : "1.5"}
                                        />

                                        <circle
                                            r="18"
                                            fill={isOccupied ? "rgba(239, 68, 68, 0.15)" : `rgba(${rgbColor}, 0.08)`}
                                            stroke={isOccupied ? "#F87171" : `rgba(${rgbColor}, 0.65)`}
                                            strokeWidth="1.5"
                                        />

                                        <text
                                            textAnchor="middle"
                                            dy=".3em"
                                            fill={isOccupied ? "#FCA5A5" : "#FFFFFF"}
                                            fontSize="11px"
                                            fontWeight="700"
                                            style={{ userSelect: "none" }}
                                        >
                                            {node.label}
                                        </text>

                                        {/* Occupied Badge above Node */}
                                        {isOccupied && (
                                            <g transform="translate(0, -28)">
                                                <rect
                                                    x="-26"
                                                    y="-7"
                                                    width="52"
                                                    height="13"
                                                    rx="3"
                                                    fill="#DC2626"
                                                    opacity="0.95"
                                                />
                                                <text
                                                    x="0"
                                                    y="2"
                                                    textAnchor="middle"
                                                    fontSize="7px"
                                                    fontWeight="800"
                                                    fill="#FFFFFF"
                                                >
                                                    OCCUPIED
                                                </text>
                                            </g>
                                        )}
                                    </g>
                                );
                            })}

                            {/* Animated Vehicles (AGVs) - Only rendered on Dark Canvas when dark simulation is running */}
                            {isSimulatingDark && vehicles.map(vehicle => (
                                <g key={vehicle.id}>
                                    {/* Edge Occupied Stop Ring */}
                                    {vehicle.status?.includes("OCCUPIED") && (
                                        <circle
                                            cx={vehicle.x}
                                            cy={vehicle.y}
                                            r="18"
                                            fill="rgba(239, 68, 68, 0.12)"
                                            stroke="#EF4444"
                                            strokeWidth="1.8"
                                            strokeDasharray="4 3"
                                            opacity="0.9"
                                        />
                                    )}
                                    {/* 3/4 Standoff Ring */}
                                    {vehicle.status?.includes("STANDOFF") && (
                                        <circle
                                            cx={vehicle.x}
                                            cy={vehicle.y}
                                            r="18"
                                            fill="rgba(245, 158, 11, 0.12)"
                                            stroke="#F59E0B"
                                            strokeWidth="1.8"
                                            strokeDasharray="4 3"
                                            opacity="0.95"
                                        />
                                    )}
                                    {/* Safety Buffer Ring */}
                                    {(vehicle.status?.includes("SAFETY") || vehicle.status?.includes("50CM")) && (
                                        <circle
                                            cx={vehicle.x}
                                            cy={vehicle.y}
                                            r="18"
                                            fill="rgba(245, 158, 11, 0.1)"
                                            stroke="#F59E0B"
                                            strokeWidth="1.8"
                                            strokeDasharray="4 3"
                                            opacity="0.9"
                                        />
                                    )}
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
                                        stroke={vehicle.status?.includes("OCCUPIED") ? "#EF4444" : (vehicle.status?.includes("STANDOFF") ? "#F59E0B" : ((vehicle.status?.includes("SAFETY") || vehicle.status?.includes("50CM")) ? "#F59E0B" : "#FFFFFF"))}
                                        strokeWidth="1.5"
                                    />
                                    {/* Edge Occupied Badge */}
                                    {vehicle.status?.includes("OCCUPIED") && (
                                        <g transform={`translate(${vehicle.x}, ${vehicle.y - 14})`}>
                                            <rect
                                                x="-34"
                                                y="-7"
                                                width="68"
                                                height="11"
                                                rx="3"
                                                fill="#DC2626"
                                                opacity="0.95"
                                            />
                                            <text
                                                x="0"
                                                y="1"
                                                textAnchor="middle"
                                                fontSize="7px"
                                                fontWeight="700"
                                                fill="#FFFFFF"
                                            >
                                                Edge Occupied
                                            </text>
                                        </g>
                                    )}
                                    {/* 3/4 Standoff Badge */}
                                    {vehicle.status?.includes("STANDOFF") && (
                                        <g transform={`translate(${vehicle.x}, ${vehicle.y - 14})`}>
                                            <rect
                                                x="-32"
                                                y="-7"
                                                width="64"
                                                height="11"
                                                rx="3"
                                                fill="#D97706"
                                                opacity="0.95"
                                            />
                                            <text
                                                x="0"
                                                y="1"
                                                textAnchor="middle"
                                                fontSize="7px"
                                                fontWeight="700"
                                                fill="#FFFFFF"
                                            >
                                                3/4 Standoff
                                            </text>
                                        </g>
                                    )}
                                    {/* Safety Buffer Badge */}
                                    {(vehicle.status?.includes("SAFETY") || vehicle.status?.includes("50CM")) && !vehicle.status?.includes("STANDOFF") && (
                                        <g transform={`translate(${vehicle.x}, ${vehicle.y - 14})`}>
                                            <rect
                                                x="-34"
                                                y="-7"
                                                width="68"
                                                height="11"
                                                rx="3"
                                                fill="#B45309"
                                                opacity="0.9"
                                            />
                                            <text
                                                x="0"
                                                y="1"
                                                textAnchor="middle"
                                                fontSize="7px"
                                                fontWeight="700"
                                                fill="#FFFFFF"
                                            >
                                                {`${Math.round(vehicle.safetyDistanceCm || 50)}cm Buffer`}
                                            </text>
                                        </g>
                                    )}

                                    {/* Live Speed Badge */}
                                    <g transform={`translate(${vehicle.x}, ${vehicle.y + 13})`}>
                                        <rect
                                            x="-23"
                                            y="-6"
                                            width="46"
                                            height="12"
                                            rx="3"
                                            fill="#0A0A0A"
                                            stroke={vehicle.motionPhase === "CRUISING" ? "#3B82F6" : (vehicle.motionPhase === "ACCELERATING" ? "#10B981" : (vehicle.motionPhase === "DECELERATING" ? "#F59E0B" : "rgba(255,255,255,0.2)"))}
                                            strokeWidth="0.8"
                                            opacity="0.92"
                                        />
                                        <text
                                            x="0"
                                            y="2.5"
                                            textAnchor="middle"
                                            fontSize="7.5px"
                                            fontWeight="700"
                                            fill={vehicle.currentSpeed > 0 ? "#10B981" : "#9CA3AF"}
                                            fontFamily="monospace"
                                        >
                                            {(vehicle.currentSpeed || 0).toFixed(1)} cm/s
                                        </text>
                                    </g>
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
