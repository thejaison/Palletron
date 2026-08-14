const styles = {
    page: {
        display: "flex",
        width: "100vw",
        height: "100vh",
        background: "#050505",
        color: "#F3F4F6",
        fontFamily: "'Outfit', sans-serif",
        overflow: "hidden"
    },

    leftPanel: {
        width: "30%",
        padding: "60px 45px",
        background: "radial-gradient(circle at 10% 40%, rgba(16, 185, 129, 0.15), rgba(7, 7, 7, 0) 60%), #070707",
        borderRight: "1px solid rgba(255, 255, 255, 0.05)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative"
    },

    brand: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        fontSize: "14px",
        fontWeight: "600",
        letterSpacing: "2px",
        color: "#10B981",
        textTransform: "uppercase",
        marginBottom: "40px"
    },

    title: {
        fontSize: "44px",
        fontWeight: 800,
        lineHeight: 1.15,
        color: "#FFFFFF",
        letterSpacing: "-1.5px"
    },

    subtitle: {
        color: "#9CA3AF",
        fontSize: "15px",
        lineHeight: 1.6,
        marginTop: "16px",
        marginBottom: "auto"
    },

    stepsContainer: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        marginTop: "40px"
    },

    activeStep: {
        display: "flex",
        alignItems: "center",
        gap: "16px",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(16, 185, 129, 0.4)",
        boxShadow: "0 0 20px rgba(16, 185, 129, 0.08)",
        borderRadius: "16px",
        padding: "18px 20px",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },

    step: {
        display: "flex",
        alignItems: "center",
        gap: "16px",
        background: "rgba(255, 255, 255, 0.01)",
        border: "1px solid rgba(255, 255, 255, 0.03)",
        borderRadius: "16px",
        padding: "18px 20px",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },

    stepNumber: {
        width: "32px",
        height: "32px",
        borderRadius: "10px",
        background: "#10B981",
        color: "#050505",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "14px",
        fontWeight: 700,
        boxShadow: "0 0 10px rgba(16, 185, 129, 0.3)"
    },

    inactiveStepNumber: {
        width: "32px",
        height: "32px",
        borderRadius: "10px",
        background: "rgba(255, 255, 255, 0.05)",
        color: "#9CA3AF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "14px",
        fontWeight: 600
    },

    stepTextContainer: {
        display: "flex",
        flexDirection: "column"
    },

    stepTitle: {
        fontSize: "14px",
        fontWeight: 600,
        color: "#FFFFFF"
    },

    stepDesc: {
        fontSize: "12px",
        color: "#6B7280",
        marginTop: "2px"
    },

    rightPanel: {
        flex: 1,
        background: "#050505",
        padding: "40px",
        display: "flex",
        flexDirection: "column",
        height: "100%"
    },

    headerRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px"
    },

    headerInfo: {
        display: "flex",
        flexDirection: "column"
    },

    headerTitle: {
        fontSize: "20px",
        fontWeight: 700,
        color: "#FFFFFF"
    },

    headerSubtitle: {
        fontSize: "13px",
        color: "#6B7280",
        marginTop: "4px"
    },

    toolbar: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.04)",
        padding: "6px",
        borderRadius: "14px"
    },

    toolDivider: {
        width: "1px",
        height: "24px",
        background: "rgba(255, 255, 255, 0.08)",
        margin: "0 4px"
    },

    toolButton: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "transparent",
        border: "1px solid transparent",
        color: "#9CA3AF",
        padding: "8px 14px",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 500,
        transition: "all 0.2s ease"
    },

    activeToolButton: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "rgba(16, 185, 129, 0.08)",
        border: "1px solid rgba(16, 185, 129, 0.2)",
        color: "#10B981",
        padding: "8px 14px",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 600,
        boxShadow: "0 0 12px rgba(16, 185, 129, 0.05)",
        transition: "all 0.2s ease"
    },

    primaryButton: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "#FFFFFF",
        border: "none",
        color: "#050505",
        padding: "10px 18px",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(255, 255, 255, 0.1)",
        transition: "all 0.2s ease"
    },

    canvas: {
        flex: 1,
        border: "1px solid rgba(255, 255, 255, 0.05)",
        borderRadius: "20px",
        background: "radial-gradient(circle at center, #0e0e0e 0%, #050505 100%)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.8)",
        cursor: "default"
    },

    nodeTypeSelector: {
        display: "flex",
        gap: "4px",
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.04)",
        padding: "4px",
        borderRadius: "10px",
        marginRight: "8px"
    },

    nodeTypeBtn: {
        border: "none",
        background: "transparent",
        color: "#6B7280",
        fontSize: "11px",
        fontWeight: 600,
        padding: "4px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        textTransform: "capitalize",
        transition: "all 0.2s ease"
    },

    nodeTypeBtnActive: (color) => ({
        border: "none",
        background: `rgba(${color}, 0.1)`,
        color: `rgb(${color})`,
        fontSize: "11px",
        fontWeight: 700,
        padding: "4px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        textTransform: "capitalize",
        transition: "all 0.2s ease"
    }),

    canvasOverlay: {
        position: "absolute",
        bottom: "20px",
        left: "20px",
        background: "rgba(10, 10, 10, 0.75)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        padding: "10px 16px",
        borderRadius: "10px",
        display: "flex",
        gap: "16px",
        pointerEvents: "none"
    },

    overlayItem: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        color: "#9CA3AF"
    },

    overlayDot: (color) => ({
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 8px ${color}`
    }),

    hint: {
        position: "absolute",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(16, 185, 129, 0.1)",
        border: "1px solid rgba(16, 185, 129, 0.2)",
        color: "#10B981",
        fontSize: "12px",
        padding: "6px 16px",
        borderRadius: "20px",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    },

    inspectorPanel: {
        position: "absolute",
        top: "20px",
        right: "20px",
        width: "280px",
        background: "rgba(10, 10, 10, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        padding: "16px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: "14px"
    },

    inspectorHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        paddingBottom: "10px"
    },

    inspectorTitle: {
        fontSize: "13px",
        fontWeight: 700,
        color: "#FFFFFF",
        letterSpacing: "0.5px"
    },

    inspectorCloseBtn: {
        background: "transparent",
        border: "none",
        color: "#9CA3AF",
        cursor: "pointer",
        fontSize: "12px",
        padding: "4px",
        transition: "color 0.2s"
    },

    inspectorBody: {
        display: "flex",
        flexDirection: "column",
        gap: "12px"
    },

    inspectorRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "12px"
    },

    inspectorLabel: {
        color: "#6B7280"
    },

    inspectorValue: {
        color: "#FFFFFF",
        fontWeight: 600
    },

    inspectorControl: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginTop: "4px"
    },

    inspectorSlider: {
        width: "100%",
        cursor: "pointer",
        accentColor: "#10B981"
    },

    inspectorSliderDistance: {
        width: "100%",
        cursor: "pointer",
        accentColor: "#3B82F6"
    },

    sliderLabels: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "10px",
        color: "#4B5563"
    },

    presetButtons: {
        display: "flex",
        gap: "6px",
        marginTop: "4px"
    },

    presetBtn: {
        flex: 1,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "6px",
        color: "#9CA3AF",
        fontSize: "11px",
        padding: "4px 0",
        cursor: "pointer",
        transition: "all 0.2s"
    },

    inspectorDeleteBtn: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        background: "rgba(239, 68, 68, 0.1)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: "8px",
        color: "#EF4444",
        fontSize: "12px",
        fontWeight: 600,
        padding: "8px 0",
        cursor: "pointer",
        marginTop: "6px",
        transition: "all 0.2s"
    },

    zoomControls: {
        position: "absolute",
        bottom: "20px",
        right: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        background: "rgba(10, 10, 10, 0.75)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        padding: "6px",
        borderRadius: "10px",
        zIndex: 10
    },

    zoomBtn: {
        width: "32px",
        height: "32px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "6px",
        color: "#FFFFFF",
        fontSize: "14px",
        fontWeight: "bold",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s"
    },

    vehicleCountContainer: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        padding: "6px 10px",
        borderRadius: "10px",
        color: "#9CA3AF",
        fontSize: "13px",
        fontWeight: 500
    },

    vehicleCountLabel: {
        fontSize: "12px",
        color: "#9CA3AF",
        userSelect: "none"
    },

    vehicleCountInput: {
        width: "35px",
        background: "transparent",
        border: "none",
        color: "#FFFFFF",
        fontSize: "13px",
        fontWeight: 600,
        outline: "none",
        textAlign: "center",
        margin: 0
    },

    landingPage: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100vw",
        height: "100vh",
        background: "radial-gradient(circle at center, #111827 0%, #030712 100%)",
        color: "#F3F4F6",
        fontFamily: "'Outfit', sans-serif",
    },
    landingCard: {
        width: "450px",
        padding: "40px",
        background: "rgba(17, 24, 39, 0.7)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "24px",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255,255,255,0.02)",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
    },
    landingBrand: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        fontSize: "16px",
        fontWeight: "700",
        color: "#10B981",
        letterSpacing: "3px",
        textTransform: "uppercase",
    },
    landingTitle: {
        fontSize: "28px",
        fontWeight: "800",
        color: "#FFFFFF",
        textAlign: "center",
        lineHeight: "1.2",
    },
    landingSubtitle: {
        color: "#9CA3AF",
        fontSize: "14px",
        textAlign: "center",
        marginTop: "-12px",
    },
    inputGroup: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
    },
    landingLabel: {
        fontSize: "12px",
        fontWeight: "600",
        color: "#9CA3AF",
        textTransform: "uppercase",
        letterSpacing: "1px",
    },
    landingInput: {
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        color: "#FFFFFF",
        padding: "12px 16px",
        fontSize: "15px",
        outline: "none",
        transition: "all 0.3s ease",
        textAlign: "center",
        letterSpacing: "1px",
    },
    landingBtnPrimary: {
        background: "#10B981",
        color: "#050505",
        border: "none",
        borderRadius: "12px",
        padding: "14px",
        fontSize: "14px",
        fontWeight: "700",
        cursor: "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        boxShadow: "0 4px 14px rgba(16, 185, 129, 0.2)",
    },
    landingBtnSecondary: {
        background: "rgba(255, 255, 255, 0.02)",
        color: "#F3F4F6",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "14px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
    },
    dividerRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        color: "#4B5563",
        fontSize: "12px",
    },
    dividerLine: {
        flex: 1,
        height: "1px",
        background: "rgba(255, 255, 255, 0.06)",
    },
    keyAlert: {
        background: "rgba(239, 68, 68, 0.1)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: "12px",
        padding: "16px",
        color: "#FCA5A5",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
    },
    keyAlertWarning: {
        fontSize: "12px",
        color: "#EF4444",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "1px",
    },
    keyAlertValue: {
        fontSize: "20px",
        fontWeight: "800",
        color: "#FFFFFF",
        letterSpacing: "2px",
        background: "rgba(0, 0, 0, 0.3)",
        padding: "8px",
        borderRadius: "8px",
        border: "1px dashed rgba(239, 68, 68, 0.3)",
    }
};

export default styles;