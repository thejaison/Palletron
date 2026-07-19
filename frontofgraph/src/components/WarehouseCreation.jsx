import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/WarehouseCreationStyles";
import { Layers, ArrowRight, ArrowLeft } from "lucide-react";

export default function WarehouseCreation() {
    const navigate = useNavigate();

    const [data, setData] = useState({
        loadingPoints: "3",
        unloadingPoints: "2",
        intersection: "Yes",
        vehicles: "3"
    });

    const handleChange = (e) => {
        setData({
            ...data,
            [e.target.name]: e.target.value
        });
    };

    const handleContinue = () => {
        navigate("/warehouse/editor", {
            state: data
        });
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
                        Configure
                        <br />
                        Logistics Fleet
                    </h1>
                    <p style={styles.subtitle}>
                        Define fleet size, load centers, and intersection behaviors to initialize pathfinding constraints.
                    </p>
                </div>

                <div style={styles.stepsContainer}>
                    <div style={styles.step} onClick={() => navigate("/")}>
                        <div style={styles.stepNumber}>✓</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Create Nodes</span>
                            <span style={styles.stepDesc}>Structure loaders & unloaders</span>
                        </div>
                    </div>

                    <div style={styles.activeStep}>
                        <div style={styles.stepNumber}>2</div>
                        <div style={styles.stepTextContainer}>
                            <span style={styles.stepTitle}>Configure Fleet</span>
                            <span style={styles.stepDesc}>Setup counts & parameters</span>
                        </div>
                    </div>

                    <div style={styles.step}>
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
                <div style={styles.formCard}>
                    <h2 style={styles.heading}>Parameters</h2>
                    <p style={styles.formDesc}>
                        Define custom limits for nodes and vehicles. We will generate the grid dynamically.
                    </p>

                    <div style={styles.field}>
                        <label style={styles.label}>Loading Points</label>
                        <input
                            style={styles.input}
                            name="loadingPoints"
                            type="number"
                            min="1"
                            max="8"
                            placeholder="eg. 3"
                            value={data.loadingPoints}
                            onChange={handleChange}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Unloading Points</label>
                        <input
                            style={styles.input}
                            name="unloadingPoints"
                            type="number"
                            min="1"
                            max="8"
                            placeholder="eg. 2"
                            value={data.unloadingPoints}
                            onChange={handleChange}
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Intersection Points</label>
                        <select
                            style={styles.input}
                            name="intersection"
                            value={data.intersection}
                            onChange={handleChange}
                        >
                            <option value="Yes">Yes (Enable crossovers)</option>
                            <option value="No">No (Strict pathways)</option>
                        </select>
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Autonomous Vehicles (AGVs)</label>
                        <input
                            style={styles.input}
                            name="vehicles"
                            type="number"
                            min="1"
                            max="6"
                            placeholder="eg. 3"
                            value={data.vehicles}
                            onChange={handleChange}
                        />
                    </div>

                    <button
                        style={styles.continueButton}
                        onClick={handleContinue}
                    >
                        Generate Workspace & Continue
                    </button>

                    <button
                        style={styles.backButton}
                        onClick={() => navigate("/")}
                    >
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                            <ArrowLeft size={13} />
                            Back to Canvas
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}