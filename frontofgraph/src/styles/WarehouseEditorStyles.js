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

    canvasContainer: {
        flex: 1,
        margin: "24px",
        borderRadius: "24px",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        background: "radial-gradient(circle at center, #0e0e0e 0%, #050505 100%)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.8)",
        display: "flex",
        flexDirection: "column"
    },

    canvasHeader: {
        padding: "20px 24px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "rgba(10, 10, 10, 0.4)",
        backdropFilter: "blur(8px)"
    },

    canvasTitleInfo: {
        display: "flex",
        flexDirection: "column"
    },

    canvasTitle: {
        fontSize: "18px",
        fontWeight: 700,
        color: "#FFFFFF"
    },

    canvasSubtitle: {
        fontSize: "12px",
        color: "#6B7280",
        marginTop: "2px"
    },

    canvasControls: {
        display: "flex",
        gap: "10px"
    },

    svgWrapper: {
        flex: 1,
        position: "relative"
    },

    sidebar: {
        width: "28%",
        background: "#070707",
        borderLeft: "1px solid rgba(255, 255, 255, 0.05)",
        padding: "40px 30px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between"
    },

    sidebarHeader: {
        marginBottom: "30px"
    },

    sidebarTitle: {
        fontSize: "22px",
        fontWeight: 700,
        color: "#FFFFFF",
        letterSpacing: "-0.5px"
    },

    sidebarSubtitle: {
        fontSize: "13px",
        color: "#6B7280",
        marginTop: "4px"
    },

    cardsContainer: {
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        marginBottom: "30px"
    },

    card: {
        background: "rgba(255, 255, 255, 0.01)",
        border: "1px solid rgba(255, 255, 255, 0.03)",
        borderRadius: "14px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
    },

    cardHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    },

    cardLabel: {
        fontSize: "13px",
        color: "#9CA3AF",
        fontWeight: 500
    },

    cardValue: {
        fontSize: "18px",
        fontWeight: 700,
        color: "#FFFFFF"
    },

    cardEditRow: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        marginTop: "4px"
    },

    cardInput: {
        background: "#0C0C0C",
        color: "#FFFFFF",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "8px",
        padding: "6px 12px",
        fontSize: "13px",
        width: "70px",
        outline: "none"
    },

    cardSelect: {
        background: "#0C0C0C",
        color: "#FFFFFF",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "8px",
        padding: "6px 10px",
        fontSize: "13px",
        outline: "none"
    },

    editBtn: {
        background: "transparent",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        color: "#9CA3AF",
        fontSize: "11px",
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        transition: "all 0.2s ease"
    },

    saveBtn: {
        background: "#FFFFFF",
        border: "none",
        color: "#050505",
        fontSize: "11px",
        fontWeight: 700,
        padding: "5px 12px",
        borderRadius: "6px",
        cursor: "pointer",
        transition: "all 0.2s ease"
    },

    footerActions: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginTop: "auto"
    },

    btnPrimary: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        background: "#FFFFFF",
        color: "#050505",
        border: "none",
        padding: "12px",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(255, 255, 255, 0.1)",
        transition: "all 0.2s ease"
    },

    btnSecondary: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        background: "transparent",
        color: "#9CA3AF",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        padding: "12px",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 500,
        transition: "all 0.2s ease"
    },

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
    }
};

export default styles;