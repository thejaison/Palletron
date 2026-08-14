package com.palletron.graph.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "plot_details")
public class PlotDetail {
    @Id
    @Column(name = "plot_id")
    private Long plotId;

    @Column(name = "key_id", nullable = false)
    private String keyId;

    @Column(name = "loading_points")
    private Integer loadingPoints;

    @Column(name = "unloading_points")
    private Integer unloadingPoints;

    @Column(name = "intersection")
    private String intersection; // "Yes" or "No"

    @Column(name = "no_of_robots")
    private Integer noOfRobots;

    // Getters and Setters
    public Long getPlotId() {
        return plotId;
    }

    public void setPlotId(Long plotId) {
        this.plotId = plotId;
    }

    public String getKeyId() {
        return keyId;
    }

    public void setKeyId(String keyId) {
        this.keyId = keyId;
    }

    public Integer getLoadingPoints() {
        return loadingPoints;
    }

    public void setLoadingPoints(Integer loadingPoints) {
        this.loadingPoints = loadingPoints;
    }

    public Integer getUnloadingPoints() {
        return unloadingPoints;
    }

    public void setUnloadingPoints(Integer unloadingPoints) {
        this.unloadingPoints = unloadingPoints;
    }

    public String getIntersection() {
        return intersection;
    }

    public void setIntersection(String intersection) {
        this.intersection = intersection;
    }

    public Integer getNoOfRobots() {
        return noOfRobots;
    }

    public void setNoOfRobots(Integer noOfRobots) {
        this.noOfRobots = noOfRobots;
    }
}
