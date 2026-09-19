import React, { Component } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./components/LandingPage";
import WarehouseCreation from "./components/WarehouseCreation";
import WarehouseEditor from "./components/WarehouseEditor";
import WarehouseSimulation from "./components/WarehouseSimulation";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: "100vh",
                    background: "#0B0F19",
                    color: "#F8FAFC",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                    fontFamily: "system-ui, -apple-system, sans-serif"
                }}>
                    <div style={{
                        background: "#151C2C",
                        padding: "32px",
                        borderRadius: "16px",
                        maxWidth: "520px",
                        width: "100%",
                        border: "1px solid rgba(255,255,255,0.08)",
                        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
                    }}>
                        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#EF4444", margin: "0 0 12px 0" }}>
                            Something went wrong
                        </h2>
                        <p style={{ fontSize: "14px", color: "#94A3B8", margin: "0 0 16px 0", lineHeight: 1.5 }}>
                            {this.state.error?.message || "An unexpected rendering error occurred."}
                        </p>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <button
                                onClick={() => {
                                    this.setState({ hasError: false, error: null });
                                    window.location.reload();
                                }}
                                style={{
                                    padding: "10px 18px",
                                    background: "#10B981",
                                    color: "#FFFFFF",
                                    border: "none",
                                    borderRadius: "8px",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }}
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={() => {
                                    window.location.href = "/";
                                }}
                                style={{
                                    padding: "10px 18px",
                                    background: "#334155",
                                    color: "#F8FAFC",
                                    border: "none",
                                    borderRadius: "8px",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }}
                            >
                                Back to Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/configure" element={<WarehouseCreation />}/>
                    <Route path="/editor" element={<WarehouseEditor />} />
                    <Route path="/simulation" element={<WarehouseSimulation />} />
                    <Route path="/simulation/schematic" element={<WarehouseSimulation defaultTab="schematic" />} />
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;