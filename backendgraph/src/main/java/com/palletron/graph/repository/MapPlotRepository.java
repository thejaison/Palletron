package com.palletron.graph.repository;

import com.palletron.graph.entity.MapPlot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MapPlotRepository extends JpaRepository<MapPlot, Long> {
    Optional<MapPlot> findByKeyId(String keyId);
    boolean existsByKeyId(String keyId);
}
