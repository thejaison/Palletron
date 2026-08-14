package com.palletron.graph.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "graph_reo")
public class GraphReo {
    @Id
    @Column(name = "plot_id")
    private Long plotId;

    @Column(name = "connections", columnDefinition = "TEXT")
    private String connections; // connection matrix JSON

    @Column(name = "weights", columnDefinition = "TEXT")
    private String weights; // weight matrix JSON

    @Column(name = "canvas_data", columnDefinition = "TEXT")
    private String canvasData; // frontend full nodes and edges list JSON

    // Getters and Setters
    public Long getPlotId() {
        return plotId;
    }

    public void setPlotId(Long plotId) {
        this.plotId = plotId;
    }

    public String getConnections() {
        return connections;
    }

    public void setConnections(String connections) {
        this.connections = connections;
    }

    public String getWeights() {
        return weights;
    }

    public void setWeights(String weights) {
        this.weights = weights;
    }

    public String getCanvasData() {
        return canvasData;
    }

    public void setCanvasData(String canvasData) {
        this.canvasData = canvasData;
    }
}
