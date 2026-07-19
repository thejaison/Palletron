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
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px"
    },

    formCard: {
        width: "480px",
        background: "rgba(255, 255, 255, 0.01)",
        border: "1px solid rgba(255, 255, 255, 0.04)",
        borderRadius: "24px",
        padding: "40px 48px",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
        position: "relative"
    },

    heading: {
        color: "#FFFFFF",
        fontSize: "30px",
        fontWeight: 700,
        letterSpacing: "-0.5px",
        marginBottom: "6px"
    },

    formDesc: {
        color: "#6B7280",
        fontSize: "14px",
        lineHeight: 1.5,
        marginBottom: "32px"
    },

    field: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        marginBottom: "20px"
    },

    label: {
        color: "#9CA3AF",
        fontSize: "13px",
        fontWeight: 500
    },

    input: {
        background: "#0E0E0E",
        color: "#FFFFFF",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        padding: "13px 16px",
        borderRadius: "12px",
        fontSize: "14px",
        fontFamily: "inherit",
        transition: "all 0.2s ease",
        outline: "none"
    },

    continueButton: {
        width: "100%",
        padding: "14px",
        marginTop: "12px",
        background: "#FFFFFF",
        color: "#050505",
        border: "none",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(255, 255, 255, 0.15)",
        transition: "all 0.2s ease"
    },

    backButton: {
        width: "100%",
        padding: "12px",
        marginTop: "12px",
        background: "transparent",
        color: "#9CA3AF",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 500,
        transition: "all 0.2s ease"
    }
};

export default styles;