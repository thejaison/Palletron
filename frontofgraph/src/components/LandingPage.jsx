import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/CreatePathStyles";
import { Layers, ArrowRight, Plus } from "lucide-react";

export default function LandingPage() {
    const navigate = useNavigate();
    const [keyInput, setKeyInput] = useState("");
    const [tempKeyMessage, setTempKeyMessage] = useState("");
    const [authError, setAuthError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleCreatePlot = async () => {
        setIsLoading(true);
        try {
            setAuthError("");
            setTempKeyMessage("");
            const response = await fetch("http://localhost:8080/api/plots/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            if (!response.ok) {
                throw new Error("Could not communicate with server to create plot.");
            }
            const data = await response.json();
            setTempKeyMessage(data.key);
            localStorage.setItem("palletron_plot_key", data.key);
        } catch (err) {
            setAuthError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPlotData = async (key) => {
        if (!key.trim()) return;
        setIsLoading(true);
        try {
            setAuthError("");
            const response = await fetch(`http://localhost:8080/api/plots/${encodeURIComponent(key)}`);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error("Plot key not found. Check character spelling or create a new plot.");
                }
                throw new Error("Unable to contact backend server.");
            }
            const data = await response.json();

            localStorage.setItem("palletron_plot_key", key);

            // If configuration has not been set, redirect to parameters configurator
            if (data.loadingPoints === undefined || data.loadingPoints === null) {
                navigate("/configure");
            } else if (data.canvasData) {
                // If it already has saved canvas data, go to simulation
                navigate("/simulation");
            } else {
                // Configured but no custom graph drawn, go to editor
                navigate("/editor");
            }
        } catch (err) {
            setAuthError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={styles.landingPage}>
            <div style={styles.landingCard}>
                <div style={styles.landingBrand}>
                    <Layers size={18} />
                    Palletron UI
                </div>
                
                <h2 style={styles.landingTitle}>Warehouse Logistics Manager</h2>
                <p style={styles.landingSubtitle}>Save, restore, and simulate AGV warehouse fleets with a secure key.</p>

                {authError && (
                    <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", padding: "12px", color: "#FCA5A5", fontSize: "13px", textAlign: "center" }}>
                        {authError}
                    </div>
                )}

                {isLoading && (
                    <div style={{ color: "#10B981", fontSize: "13px", textAlign: "center", fontWeight: "bold" }}>
                        Loading...
                    </div>
                )}

                {tempKeyMessage ? (
                    <div style={styles.keyAlert}>
                        <span style={styles.keyAlertWarning}>Remember This Key!</span>
                        <span style={styles.keyAlertValue}>{tempKeyMessage}</span>
                        <p style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "4px" }}>
                            It is your responsibility to remember this key. Share or re-enter it to access this plot representation.
                        </p>
                        <button
                            style={{ ...styles.landingBtnPrimary, marginTop: "12px" }}
                            onClick={() => {
                                navigate("/configure");
                            }}
                        >
                            Proceed to Configure Fleet
                            <ArrowRight size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={styles.inputGroup}>
                            <label style={styles.landingLabel}>Enter Existing Plot Key</label>
                            <input
                                style={styles.landingInput}
                                type="text"
                                placeholder="e.g. 6%3FH$"
                                value={keyInput}
                                onChange={(e) => setKeyInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") fetchPlotData(keyInput);
                                }}
                            />
                        </div>

                        <button
                            style={styles.landingBtnPrimary}
                            onClick={() => fetchPlotData(keyInput)}
                            disabled={!keyInput.trim() || isLoading}
                        >
                            Enter Key
                        </button>

                        <div style={styles.dividerRow}>
                            <div style={styles.dividerLine}></div>
                            <span>OR</span>
                            <div style={styles.dividerLine}></div>
                        </div>

                        <button
                            style={styles.landingBtnSecondary}
                            onClick={handleCreatePlot}
                            disabled={isLoading}
                        >
                            <Plus size={16} />
                            Create a Plot
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
