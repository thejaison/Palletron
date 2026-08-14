package com.palletron.graph.repository;

import com.palletron.graph.entity.PlotDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PlotDetailRepository extends JpaRepository<PlotDetail, Long> {
    Optional<PlotDetail> findByKeyId(String keyId);
}
